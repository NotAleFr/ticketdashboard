const { test } = require('node:test');
const assert = require('node:assert/strict');

test('Pages forwards API requests and preserves redirects and response streams', async () => {
  const { onRequest } = await import('../functions/api/[[path]].js');
  const origin = 'https://tickets.example';
  const input = new Request(origin + '/api/tickets?periodo=todos', {
    method: 'POST',
    headers: { Authorization: 'Bearer fixture' },
    body: '{"fixture":true}',
  });
  let forwarded;
  const env = { API: { async fetch(request) {
    forwarded = request;
    return new Response(null, { status: 307, headers: { Location: origin + '/tickets/?periodo=todos' } });
  } } };
  const response = await onRequest({ request: input, env });
  assert.equal(forwarded.url, origin + '/tickets?periodo=todos');
  assert.equal(forwarded.method, 'POST');
  assert.equal(forwarded.redirect, 'manual');
  assert.equal(forwarded.headers.get('Authorization'), 'Bearer fixture');
  assert.equal(await forwarded.text(), '{"fixture":true}');
  assert.equal(response.headers.get('Location'), '/api/tickets/?periodo=todos');

  const csv = new Response('id\n1\n', { headers: { 'Content-Disposition': 'attachment' } });
  env.API.fetch = async () => csv;
  assert.equal(await onRequest({ request: new Request(origin + '/api/reportes/exportar'), env }), csv);
});
