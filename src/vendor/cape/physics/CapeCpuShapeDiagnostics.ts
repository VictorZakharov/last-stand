import * as THREE from 'three';
import { CAPE } from '../config';
import type { CapeAnchors } from '../player/Character';
import { caveGroundHeightAt } from '../world/caveProfile';
import { getCapeRestWidth } from './CapeRestShape';

export class CapeCpuShapeDiagnostics {
  private readonly rightAxis = new THREE.Vector3();
  private readonly rowCenter = new THREE.Vector3();
  private readonly drapeDelta = new THREE.Vector3();
  private readonly horizontalOffset = new THREE.Vector3();
  private readonly centerlineStart = new THREE.Vector3();
  private readonly centerlineEnd = new THREE.Vector3();
  private readonly centerlinePoint = new THREE.Vector3();
  private readonly rowChordPoint = new THREE.Vector3();

  public constructor(
    private readonly positions: THREE.Vector3[],
    private readonly anchorCenter: THREE.Vector3,
  ) {}

  public getParticlePosition(column: number, row: number): THREE.Vector3 {
    const position = this.positions[this.index(column, row)];
    if (!position) throw new RangeError('Cape particle index is outside the simulation grid.');
    return position.clone();
  }

  public getHemDrop(): number {
    let height = 0;
    for (let column = 0; column < CAPE.columns; column += 1) {
      height += this.positions[this.index(column, CAPE.rows - 1)]?.y ?? this.anchorCenter.y;
    }
    return this.anchorCenter.y - height / CAPE.columns;
  }

  public getMinimumLowerCapeDrop(): number {
    let minimum = Number.POSITIVE_INFINITY;
    const firstLowerRow = Math.floor(CAPE.rows * 0.58);
    for (let row = firstLowerRow; row < CAPE.rows; row += 1) {
      for (let column = 0; column < CAPE.columns; column += 1) {
        const position = this.positions[this.index(column, row)];
        if (position) minimum = Math.min(minimum, this.anchorCenter.y - position.y);
      }
    }
    return minimum;
  }

  public getMaximumLowerCapeLateralOffset(anchors: CapeAnchors): number {
    this.rightAxis.copy(anchors.right).sub(anchors.left).normalize();
    const firstLowerRow = Math.floor(CAPE.rows * 0.58);
    let maximum = 0;
    for (let row = firstLowerRow; row < CAPE.rows; row += 1) {
      this.getRowCenter(row, this.rowCenter);
      maximum = Math.max(
        maximum,
        Math.abs(this.drapeDelta.copy(this.rowCenter).sub(this.anchorCenter).dot(this.rightAxis)),
      );
    }
    return maximum;
  }

  public getMaximumLowerCapeHorizontalOffset(): number {
    const firstLowerRow = Math.floor(CAPE.rows * 0.58);
    let maximum = 0;
    for (let row = firstLowerRow; row < CAPE.rows; row += 1) {
      this.getRowCenter(row, this.rowCenter);
      this.horizontalOffset.copy(this.rowCenter).sub(this.anchorCenter).setY(0);
      maximum = Math.max(maximum, this.horizontalOffset.length());
    }
    return maximum;
  }

  public getAverageLowerCapeSpanRatio(anchors: CapeAnchors, capeWidth: number): number {
    this.rightAxis.copy(anchors.right).sub(anchors.left).normalize();
    const anchorWidth = anchors.right.distanceTo(anchors.left);
    const firstLowerRow = Math.floor(CAPE.rows * 0.58);
    let ratioTotal = 0;
    let rowCount = 0;
    for (let row = firstLowerRow; row < CAPE.rows; row += 1) {
      const left = this.positions[this.index(0, row)];
      const right = this.positions[this.index(CAPE.columns - 1, row)];
      if (!left || !right) continue;
      const down = row / (CAPE.rows - 1);
      const restWidth = getCapeRestWidth(anchorWidth, down, capeWidth);
      const lateralSpan = Math.abs(
        this.drapeDelta.copy(right).sub(left).dot(this.rightAxis),
      );
      ratioTotal += lateralSpan / Math.max(0.000_001, restWidth);
      rowCount += 1;
    }
    return rowCount > 0 ? ratioTotal / rowCount : 0;
  }

  public getCapeRowTwistRange(anchors: CapeAnchors, capeWidth: number): number {
    const anchorWidth = anchors.right.distanceTo(anchors.left);
    let minimum = Number.POSITIVE_INFINITY;
    let maximum = Number.NEGATIVE_INFINITY;
    for (let row = 1; row < CAPE.rows; row += 1) {
      const left = this.positions[this.index(0, row)];
      const right = this.positions[this.index(CAPE.columns - 1, row)];
      if (!left || !right) continue;
      const down = row / (CAPE.rows - 1);
      const restWidth = getCapeRestWidth(anchorWidth, down, capeWidth);
      const twist = this.drapeDelta.copy(right).sub(left).dot(anchors.back)
        / Math.max(0.000_001, restWidth);
      minimum = Math.min(minimum, twist);
      maximum = Math.max(maximum, twist);
    }
    return Number.isFinite(minimum) && Number.isFinite(maximum) ? maximum - minimum : 0;
  }

  public getCapeCenterlineDeviation(): number {
    this.getRowCenter(0, this.centerlineStart);
    this.getRowCenter(CAPE.rows - 1, this.centerlineEnd);
    let maximum = 0;
    for (let row = 1; row < CAPE.rows - 1; row += 1) {
      const down = row / (CAPE.rows - 1);
      this.getRowCenter(row, this.rowCenter);
      this.centerlinePoint.lerpVectors(this.centerlineStart, this.centerlineEnd, down);
      maximum = Math.max(maximum, this.rowCenter.distanceTo(this.centerlinePoint));
    }
    return maximum;
  }

  public getMaximumLowerCapeRowCurlRatio(anchors: CapeAnchors, capeWidth: number): number {
    const anchorWidth = anchors.right.distanceTo(anchors.left);
    const firstLowerRow = Math.floor(CAPE.rows * 0.58);
    let maximum = 0;
    for (let row = firstLowerRow; row < CAPE.rows; row += 1) {
      const left = this.positions[this.index(0, row)];
      const right = this.positions[this.index(CAPE.columns - 1, row)];
      if (!left || !right) continue;
      const down = row / (CAPE.rows - 1);
      const restWidth = getCapeRestWidth(anchorWidth, down, capeWidth);
      for (let column = 1; column < CAPE.columns - 1; column += 1) {
        const position = this.positions[this.index(column, row)];
        if (!position) continue;
        this.rowChordPoint.lerpVectors(left, right, column / (CAPE.columns - 1));
        maximum = Math.max(
          maximum,
          position.distanceTo(this.rowChordPoint) / Math.max(0.000_001, restWidth),
        );
      }
    }
    return maximum;
  }

  public getHemBackOffset(anchors: CapeAnchors): number {
    this.getRowCenter(CAPE.rows - 1, this.rowCenter);
    return this.drapeDelta.copy(this.rowCenter).sub(this.anchorCenter).dot(anchors.back);
  }

  public getMinimumHemGroundClearance(): number {
    let minimum = Number.POSITIVE_INFINITY;
    for (let column = 0; column < CAPE.columns; column += 1) {
      const position = this.positions[this.index(column, CAPE.rows - 1)];
      if (position) {
        minimum = Math.min(
          minimum,
          position.y - caveGroundHeightAt(position.x, position.z),
        );
      }
    }
    return minimum;
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
