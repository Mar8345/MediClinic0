# Frontend Integration Notes

The provided frontend is preserved under `source-frontend/ITI-full-frontend.rar`.

Because the supplied archive is RAR5 and the build environment did not have a RAR5 extraction utility, its HTML/CSS/JavaScript source could not be unpacked for browser-level integration testing. The backend side is prepared for integration:

- CORS is controlled with `FRONTEND_ORIGIN`.
- Private requests use `Authorization: Bearer <token>`.
- JSON requests are accepted by every Express service.
- The endpoint base URLs are documented in `docs/api-contract.md`.

Recommended local connection map:

- Doctor UI -> `http://localhost:4001`
- Patient UI -> `http://localhost:4002`
- Secretary UI -> `http://localhost:4003`
- Admin UI -> `http://localhost:4004`

Example request pattern:

```js
const response = await fetch('http://localhost:4002/api/patients/medical-history', {
  headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
});
const data = await response.json();
```
