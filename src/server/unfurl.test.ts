import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { fetchPreview, isPublicAddress, parsePreview } from "./unfurl.ts";

test("only public addresses may be fetched", () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0",
    "224.0.0.1", "198.51.100.7", "::1", "::", "fe80::1", "fc00::1", "fd12::3", "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:a9fe:a9fe", "2001:db8::1"]) {
    assert.equal(isPublicAddress(ip), false, ip);
  }
  for (const ip of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"]) assert.equal(isPublicAddress(ip), true, ip);
  assert.equal(isPublicAddress("not-an-ip"), false);
});

test("a page's preview comes from Open Graph tags, then its <title>; links are made absolute", () => {
  const html = `<html><head><title>Fallback &amp; title</title>
    <meta property="og:title" content="Ship it &#x2014; faster">
    <meta content="The release notes." name="description">
    <meta property='og:image' content='/img/card.png'>
    <meta property="og:site_name" content="Acme Blog">
    <link rel="shortcut icon" href="https://cdn.acme.example/fav.ico">
    <meta property="og:url" content="javascript:alert(1)"></head><body>…</body></html>`;
  assert.deepEqual(parsePreview(html, "https://www.acme.example/posts/1"), {
    url: "https://www.acme.example/posts/1", domain: "acme.example", title: "Ship it — faster", description: "The release notes.",
    image: "https://www.acme.example/img/card.png", icon: "https://cdn.acme.example/fav.ico", siteName: "Acme Blog",
  });
  assert.equal(parsePreview("<title>Only a title</title>", "https://x.example/").title, "Only a title");
  assert.equal(parsePreview("<p>nothing</p>", "https://x.example/").title, "x.example");
});

test("the fetch refuses private addresses, including by name and through a redirect", async () => {
  const server = createServer((req, res) => {
    if (req.url === "/hop") { res.writeHead(302, { Location: "http://127.0.0.1/secret" }); return res.end(); }
    res.writeHead(200, { "Content-Type": "text/html" }).end("<title>Internal</title>");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  try {
    await assert.rejects(fetchPreview(`http://127.0.0.1:${port}/`), /isn't allowed/);
    await assert.rejects(fetchPreview(`http://localhost:${port}/`), /isn't allowed/);
    await assert.rejects(fetchPreview(`http://[::1]:${port}/`), /isn't allowed/);
    await assert.rejects(fetchPreview("file:///etc/passwd"), /plain http/);
    await assert.rejects(fetchPreview("http://user:pass@example.com/"), /plain http/);
  } finally {
    server.close();
  }
});
