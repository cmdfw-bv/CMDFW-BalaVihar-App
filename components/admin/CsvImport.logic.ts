export function csvImportPhase(fileName?: string): 'dropzone' | 'summary' {
  return fileName ? 'summary' : 'dropzone';
}
