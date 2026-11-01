import { bootCompanion } from './boot';

// Chrome's native PDF viewer is a browser plugin: its text layer is not reachable from a content
// script, so she would only hover over an unreadable surface. The bundled reader handles PDFs.
if (
  (location.protocol === 'https:' || location.protocol === 'http:') &&
  document.contentType !== 'application/pdf'
)
  bootCompanion();
