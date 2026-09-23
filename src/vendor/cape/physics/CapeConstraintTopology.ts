import { CAPE } from '../config';

export interface CapeDistanceConstraintDefinition {
  readonly firstColumn: number;
  readonly firstRow: number;
  readonly secondColumn: number;
  readonly secondRow: number;
  readonly stiffness: number;
  readonly structural: boolean;
}

function createCapeDistanceConstraintDefinitions(): CapeDistanceConstraintDefinition[] {
  const definitions: CapeDistanceConstraintDefinition[] = [];
  const add = (
    firstColumn: number,
    firstRow: number,
    secondColumn: number,
    secondRow: number,
    stiffness: number,
    structural: boolean,
  ): void => {
    definitions.push({
      firstColumn,
      firstRow,
      secondColumn,
      secondRow,
      stiffness,
      structural,
    });
  };

  // This order is part of the solver behavior. WebGL's Gauss-Seidel sweep
  // observes every preceding correction while walking this exact stream.
  for (let row = 0; row < CAPE.rows; row += 1) {
    for (let column = 0; column < CAPE.columns; column += 1) {
      if (column + 1 < CAPE.columns) add(column, row, column + 1, row, 0.93, true);
      if (row + 1 < CAPE.rows) add(column, row, column, row + 1, 0.96, true);
      if (column + 1 < CAPE.columns && row + 1 < CAPE.rows) {
        add(column, row, column + 1, row + 1, 0.8, false);
        add(column + 1, row, column, row + 1, 0.8, false);
      }
      if (column + 2 < CAPE.columns) add(column, row, column + 2, row, 0.58, false);
      if (row + 2 < CAPE.rows) add(column, row, column, row + 2, 0.82, false);
      if (column + 3 < CAPE.columns) add(column, row, column + 3, row, 0.16, false);
      if (row + 3 < CAPE.rows) add(column, row, column, row + 3, 0.38, false);
    }
  }
  return definitions;
}

export const CAPE_DISTANCE_CONSTRAINTS: readonly CapeDistanceConstraintDefinition[] =
  createCapeDistanceConstraintDefinitions();
