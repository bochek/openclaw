import { appendFileSync } from "node:fs";
import { buildCIExecutionManifest } from "./test-planner/planner.mjs";

const outputPath = process.env.GITHUB_OUTPUT;

if (!outputPath) {
  throw new Error("GITHUB_OUTPUT is required");
}

const manifest = buildCIExecutionManifest(undefined, { env: process.env });

const writeOutput = (name, value) => {
  appendFileSync(outputPath, `${name}=${value}\n`, "utf8");
};

writeOutput("run_build_artifacts", String(manifest.jobs.buildArtifacts.enabled));
writeOutput("run_release_check", String(manifest.jobs.releaseCheck.enabled));
writeOutput("run_checks_fast", String(manifest.jobs.checksFast.enabled));
writeOutput("checks_fast_matrix", JSON.stringify(manifest.jobs.checksFast.matrix));
writeOutput("run_checks", String(manifest.jobs.checks.enabled));
writeOutput("checks_matrix", JSON.stringify(manifest.jobs.checks.matrix));
writeOutput("run_extension_fast", String(manifest.jobs.extensionFast.enabled));
writeOutput("extension_fast_matrix", JSON.stringify(manifest.jobs.extensionFast.matrix));
writeOutput("run_check", String(manifest.jobs.check.enabled));
writeOutput("run_check_additional", String(manifest.jobs.checkAdditional.enabled));
writeOutput("run_build_smoke", String(manifest.jobs.buildSmoke.enabled));
writeOutput("run_check_docs", String(manifest.jobs.checkDocs.enabled));
writeOutput("run_skills_python", String(manifest.jobs.skillsPython.enabled));
writeOutput("run_checks_windows", String(manifest.jobs.checksWindows.enabled));
writeOutput("checks_windows_matrix", JSON.stringify(manifest.jobs.checksWindows.matrix));
writeOutput("run_macos_node", String(manifest.jobs.macosNode.enabled));
writeOutput("macos_node_matrix", JSON.stringify(manifest.jobs.macosNode.matrix));
writeOutput("run_macos_swift_lint", String(manifest.jobs.macosSwiftLint.enabled));
writeOutput("run_macos_swift_build", String(manifest.jobs.macosSwiftBuild.enabled));
writeOutput("run_macos_swift_test", String(manifest.jobs.macosSwiftTest.enabled));
writeOutput("run_android", String(manifest.jobs.android.enabled));
writeOutput("android_matrix", JSON.stringify(manifest.jobs.android.matrix));
writeOutput("run_bun_checks", String(manifest.jobs.bunChecks.enabled));
writeOutput("bun_checks_matrix", JSON.stringify(manifest.jobs.bunChecks.matrix));
writeOutput("run_install_smoke", String(manifest.jobs.installSmoke.enabled));
writeOutput("required_check_names", JSON.stringify(manifest.requiredCheckNames));
