import * as React from "react";

export interface CsvImportProps {
  /** When set, switches from dropzone to parsed-summary state. */
  fileName?: string;
  total?: number;
  ready?: number;
  flagged?: number;
  /** Open the file picker / replace the file. */
  onChoose?: () => void;
  /** Confirm the import. */
  onConfirm?: () => void;
  style?: React.CSSProperties;
}

/**
 * CsvImport — enrollment CSV dropzone + parsed summary (ready / flagged).
 */
export function CsvImport(props: CsvImportProps): JSX.Element;
