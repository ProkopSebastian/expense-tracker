import assert from "node:assert/strict";
import test from "node:test";
import { importStatement } from "../src/importStatement.ts";

test("Polish filenames keep their body and account without invalid HTTP headers", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, headers: new Headers(options.headers), body: options.body });
    return Response.json({ message: "Zaimportowano." });
  };
  try {
    for (const name of ["wyciąg.csv", "historia_Łódź.PDF"]) {
      const file = new File(["synthetic"], name);
      assert.deepEqual(await importStatement(file, "Rachunek żony"), { message: "Zaimportowano." });
      const call = calls.at(-1);
      assert.equal(call.url, `/api/import?account=${encodeURIComponent("Rachunek żony")}`);
      assert.equal(call.body, file);
      assert.match(call.headers.get("X-File-Name"), /^upload\.(csv|pdf)$/);
    }
    await assert.rejects(importStatement(new File(["synthetic"], "wyciąg.ą"), ""), /CSV lub PDF/);
    assert.equal(calls.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
