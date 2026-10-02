import { Pipe, PipeTransform } from '@angular/core';

const REFERENCE_FOLDERS = ['old', 'process dwg'];

function isReference(file: any): boolean {
  const folder = (file.folder || '').toLowerCase();
  return REFERENCE_FOLDERS.some(r => folder.includes(r));
}

@Pipe({ name: 'primaryFiles', standalone: true, pure: true })
export class PrimaryFilesPipe implements PipeTransform {
  transform(files: any[]): any[] {
    if (!files) return [];
    return files.filter(f => !isReference(f));
  }
}

@Pipe({ name: 'referenceFiles', standalone: true, pure: true })
export class ReferenceFilesPipe implements PipeTransform {
  transform(files: any[]): any[] {
    if (!files) return [];
    return files.filter(f => isReference(f));
  }
}
