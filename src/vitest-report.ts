import { relative } from "node:path";

/** The part of vitest 3's `--reporter=json` output oid reads. */
export interface VitestReport {
  testResults: {
    name: string;
    status: string;
    message?: string;
    assertionResults: { fullName: string; status: string; failureMessages?: string[] }[];
  }[];
}

/** Each passed test as `<file relative to root> > <full name>`. */
export function passedTests(report: VitestReport, root: string): string[] {
  return testsWithStatus(report, root, "passed");
}

export interface TestFailure {
  /** `<file> > <full name>`, or the file alone when it failed before running a test. */
  test: string;
  message: string;
}

/** Each failed test with the first line of its failure message, and each test file that failed without running a test. */
export function testFailures(report: VitestReport, root: string): TestFailure[] {
  const firstLine = (text: string | undefined): string => (text ?? "").split("\n")[0]!;
  return report.testResults.flatMap((file) => {
    const path = relative(root, file.name);
    if (file.status === "failed" && file.assertionResults.length === 0) return [{ test: path, message: firstLine(file.message) }];
    return file.assertionResults
      .filter((test) => test.status === "failed")
      .map((test) => ({ test: `${path} > ${test.fullName}`, message: firstLine(test.failureMessages?.[0]) }));
  });
}

/** Each failed test as `<file> > <full name>`, and each test file that failed without running a test as `<file>: <message>`. */
export function failedTests(report: VitestReport, root: string): string[] {
  const unloaded = report.testResults
    .filter((file) => file.status === "failed" && file.assertionResults.length === 0)
    .map((file) => `${relative(root, file.name)}: ${file.message ?? ""}`);
  return [...testsWithStatus(report, root, "failed"), ...unloaded];
}

function testsWithStatus(report: VitestReport, root: string, status: string): string[] {
  return report.testResults.flatMap((file) =>
    file.assertionResults.filter((test) => test.status === status).map((test) => `${relative(root, file.name)} > ${test.fullName}`),
  );
}
