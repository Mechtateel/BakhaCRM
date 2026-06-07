import { getAmoImportStats, runAmoImport, verifyAmoImport } from "./amoImportService.js";

const command = process.argv[2] ?? "import";

const result =
  command === "verify"
    ? await verifyAmoImport()
    : command === "stats"
    ? await getAmoImportStats()
    : command === "dry-run"
      ? await runAmoImport("dry-run")
      : await runAmoImport("import");

console.log(JSON.stringify(result, null, 2));

if (result.errors.length && command !== "stats") {
  console.error(`Amo import finished with ${result.errors.length} error(s).`);
}
