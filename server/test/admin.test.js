import test from "node:test";
import assert from "node:assert/strict";

import { isSameOriginRequest } from "../src/admin.js";

test("admin origin accepts the configured public custom domain", () => {
  const previousOrigin = process.env.XLEAVE_PUBLIC_ORIGIN;
  process.env.XLEAVE_PUBLIC_ORIGIN = "https://xleave.59et.com";

  try {
    assert.equal(
      isSameOriginRequest(
        createRequest({
          origin: "https://xleave.59et.com",
          host: "internal-vercel-host.example"
        })
      ),
      true
    );
  } finally {
    restoreEnv("XLEAVE_PUBLIC_ORIGIN", previousOrigin);
  }
});

test("admin origin accepts Vercel x-forwarded-host", () => {
  assert.equal(
    isSameOriginRequest(
      createRequest({
        origin: "https://preview.example.vercel.app",
        host: "internal.example",
        forwardedHost: "preview.example.vercel.app"
      })
    ),
    true
  );
});

test("admin origin rejects cross-site and unknown hosts", () => {
  assert.equal(
    isSameOriginRequest(
      createRequest({
        origin: "https://evil.example",
        host: "xleave.59et.com",
        fetchSite: "cross-site"
      })
    ),
    false
  );
  assert.equal(
    isSameOriginRequest(
      createRequest({
        origin: "https://evil.example",
        host: "xleave.59et.com"
      })
    ),
    false
  );
});

function createRequest({
  origin,
  referer,
  host,
  forwardedHost,
  fetchSite
}) {
  const headers = {
    origin,
    referer,
    host,
    "x-forwarded-host": forwardedHost,
    "sec-fetch-site": fetchSite
  };
  return {
    get(name) {
      return headers[name];
    }
  };
}

function restoreEnv(name, previousValue) {
  if (previousValue === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = previousValue;
  }
}
