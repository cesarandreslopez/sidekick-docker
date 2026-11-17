// Healthcheck for the storefront app. `payments` always fails, so the demo has
// an unhealthy container whose last probe output says why.
const mode = process.argv[2] ?? 'api';
if (mode === 'payments') {
  console.log('upstream pay.example.com timed out after 5s');
  process.exit(1);
}
console.log('ok');
