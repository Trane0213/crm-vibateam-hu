/**
 * CLI: bun run ai:acceptance
 *
 * Statikus AI OS jogosultsági / szerepkör smoke check. Exit 1 hibánál.
 */
import { runAcceptance, formatReport } from "../src/lib/ai-os/tests/runner";

const report = runAcceptance();
console.log(formatReport(report));
process.exit(report.ok ? 0 : 1);
