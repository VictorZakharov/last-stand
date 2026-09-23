import * as THREE from 'three';
import { CAPE } from '../config';
import type { CapeAnchors } from '../player/Character';
import {
  CAPE_ROW_CURL_RELAXATION,
  CAPE_ROW_SPAN_RELAXATION,
  getCapeRestWidth,
  MAXIMUM_CAPE_ROW_CURL_RATIO,
  MINIMUM_CAPE_ROW_SPAN_RATIO,
} from './CapeRestShape';
import { IDLE_DRAPE_RECOVERY_PER_STEP } from './CapeSolverConstants';
import { ClothFoldGuard } from './ClothFoldGuard';
import { ClothSelfCollision } from './ClothSelfCollision';

export class CapeCpuShapeGuards {
  private readonly selfCollision: ClothSelfCollision;
  private readonly foldGuard: ClothFoldGuard;
  private readonly correction = new THREE.Vector3();
  private readonly delta = new THREE.Vector3();
  private readonly rightAxis = new THREE.Vector3();
  private readonly rowCenter = new THREE.Vector3();
  private readonly horizontalOffset = new THREE.Vector3();
  private readonly rowChordPoint = new THREE.Vector3();
  private readonly rowCurl = new THREE.Vector3();

  public constructor(
    private readonly positions: THREE.Vector3[],
    private readonly previous: THREE.Vector3[],
    private readonly inverseMass: Float32Array,
    private readonly anchorCenter: THREE.Vector3,
  ) {
    const particleCount = CAPE.columns * CAPE.rows;
    this.selfCollision = new ClothSelfCollision(particleCount, CAPE.columns);
    this.foldGuard = new ClothFoldGuard(CAPE.columns, CAPE.rows);
  }

  public solveSelfCollision(): void {
    this.selfCollision.solve(this.positions, this.previous, this.inverseMass);
  }

  public solveFoldAndRows(anchors: CapeAnchors, capeWidth: number): void {
    this.foldGuard.solve(this.positions, this.previous, this.inverseMass);
    this.solveRowSpanGuard(anchors, capeWidth);
    this.solveRowCurlGuard(anchors, capeWidth);
  }

  public solveIdleDrapeRecovery(strength: number): void {
    for (let row = 1; row < CAPE.rows; row += 1) {
      this.getRowCenter(row, this.rowCenter);
      this.horizontalOffset
        .copy(this.rowCenter)
        .sub(this.anchorCenter)
        .setY(0);
      if (this.horizontalOffset.lengthSq() < 0.000_001) continue;
      const down = row / (CAPE.rows - 1);
      this.correction.copy(this.horizontalOffset).multiplyScalar(
        -IDLE_DRAPE_RECOVERY_PER_STEP
        * strength
        * THREE.MathUtils.smoothstep(down, 0.05, 1),
      );
      for (let column = 0; column < CAPE.columns; column += 1) {
        const index = this.index(column, row);
        this.positions[index]?.add(this.correction);
        this.previous[index]?.add(this.correction);
      }
    }
  }

  public getMinimumSelfSeparation(): number {
    return this.selfCollision.getMinimumSeparation(this.positions);
  }

  public getMaximumUpwardFold(): number {
    return this.foldGuard.getMaximumUpwardFold(this.positions);
  }

  private solveRowSpanGuard(anchors: CapeAnchors, capeWidth: number): void {
    this.rightAxis.copy(anchors.right).sub(anchors.left).normalize();
    const anchorWidth = anchors.right.distanceTo(anchors.left);
    for (let row = 1; row < CAPE.rows; row += 1) {
      const leftIndex = this.index(0, row);
      const rightIndex = this.index(CAPE.columns - 1, row);
      const left = this.positions[leftIndex];
      const right = this.positions[rightIndex];
      const leftPrevious = this.previous[leftIndex];
      const rightPrevious = this.previous[rightIndex];
      if (!left || !right || !leftPrevious || !rightPrevious) continue;
      const down = row / (CAPE.rows - 1);
      const minimumSpan = getCapeRestWidth(anchorWidth, down, capeWidth)
        * MINIMUM_CAPE_ROW_SPAN_RATIO;
      const lateralSpan = this.delta.copy(right).sub(left).dot(this.rightAxis);
      const deficit = minimumSpan - lateralSpan;
      if (deficit <= 0) continue;
      this.correction.copy(this.rightAxis)
        .multiplyScalar(deficit * CAPE_ROW_SPAN_RELAXATION * 0.5);
      left.sub(this.correction);
      right.add(this.correction);
      leftPrevious.sub(this.correction);
      rightPrevious.add(this.correction);
    }
  }

  private solveRowCurlGuard(anchors: CapeAnchors, capeWidth: number): void {
    const anchorWidth = anchors.right.distanceTo(anchors.left);
    for (let row = 1; row < CAPE.rows; row += 1) {
      const left = this.positions[this.index(0, row)];
      const right = this.positions[this.index(CAPE.columns - 1, row)];
      if (!left || !right) continue;
      const down = row / (CAPE.rows - 1);
      const maximumCurl = getCapeRestWidth(anchorWidth, down, capeWidth)
        * MAXIMUM_CAPE_ROW_CURL_RATIO;
      for (let column = 1; column < CAPE.columns - 1; column += 1) {
        const index = this.index(column, row);
        const position = this.positions[index];
        const previous = this.previous[index];
        if (!position || !previous) continue;
        this.rowChordPoint.lerpVectors(left, right, column / (CAPE.columns - 1));
        this.rowCurl.copy(position).sub(this.rowChordPoint);
        const curl = this.rowCurl.length();
        if (curl <= maximumCurl || curl < 0.000_001) continue;
        this.rowCurl.multiplyScalar(
          ((curl - maximumCurl) / curl) * CAPE_ROW_CURL_RELAXATION,
        );
        position.sub(this.rowCurl);
        previous.sub(this.rowCurl);
      }
    }
  }

  private getRowCenter(row: number, target: THREE.Vector3): THREE.Vector3 {
    target.set(0, 0, 0);
    for (let column = 0; column < CAPE.columns; column += 1) {
      const position = this.positions[this.index(column, row)];
      if (position) target.add(position);
    }
    return target.multiplyScalar(1 / CAPE.columns);
  }

  private index(column: number, row: number): number {
    return row * CAPE.columns + column;
  }
}
