# Online Attendance Tracker

A static web app for the **Wintech – Amiral Project** attendance system.

## Pages

| File | Description |
|---|---|
| `index.html` | Landing page with links to the WINTECH and RENTAL attendance apps |
| `Attendance.html` | Embedded Excel Online spreadsheet with an optional attendance-proof upload section |

## Attendance Proof Upload

`Attendance.html` includes an optional **privacy-first file upload** section below the spreadsheet.

### How it works

1. The user selects an image, PDF, or Word document as their attendance proof.
2. The browser reads the file **entirely in memory** using the `FileReader` API.
3. A **SHA-256 fingerprint** is computed client-side with the Web Crypto API (`crypto.subtle.digest`).
4. A small metadata record is stored in **`localStorage`** under the key `attendance_proofs`:

   ```json
   {
     "fileName": "proof.jpg",
     "mimeType": "image/jpeg",
     "size": 204800,
     "sha256": "e3b0c44298fc1c14...",
     "timestamp": "2025-06-01T08:30:00.000Z"
   }
   ```

5. The raw file bytes are **immediately discarded** — they are never sent to a server, written to disk, or stored in any external system.

### Configuration

The behaviour is controlled by a `CONFIG` object at the top of the `<script>` block in `Attendance.html`:

```js
var CONFIG = {
  STORE_UPLOADS: false,      // Must remain false — set to true only for local debugging
  MAX_FILE_SIZE_MB: 10,      // Maximum allowed file size
  ALLOWED_MIME_PREFIXES: [   // Allowed MIME type prefixes
    'image/',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument'
  ]
};
```

| Flag | Default | Description |
|---|---|---|
| `STORE_UPLOADS` | `false` | When `false` (the safe default) the file is never uploaded or persisted. Setting this to `true` is reserved for future backward-compatibility if a storage backend is introduced. |
| `MAX_FILE_SIZE_MB` | `10` | Files larger than this are rejected before any processing begins. |
| `ALLOWED_MIME_PREFIXES` | see above | Files whose MIME type does not match one of these prefixes are rejected. |

### Security notes

- File size and MIME type are validated **before** any bytes are read.
- The file bytes are read into a temporary `ArrayBuffer` that is nulled out immediately after the hash is computed.
- No file content ever leaves the browser.
- `escapeHtml()` is used on all user-supplied strings rendered into the DOM to prevent XSS.

### Viewing stored metadata

Open your browser's DevTools → Application → Local Storage and look for the key `attendance_proofs`. Each entry is a JSON array of metadata records.

To clear the records:

```js
localStorage.removeItem('attendance_proofs');
```

## Deployment

This is a static site deployed on **GitHub Pages**. Push to the `main` branch to update the live site.
