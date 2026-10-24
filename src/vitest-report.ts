import { relative } from "node:path";

/** The part of vitest 3's `--reporter=json` output oid reads. */
export interface VitestReport {
  testResults: {
    name: string;
    assertionResults: { fullName: string; status: string }[];
  }[];
}

/** Each passed test as `<file relative to root> > <full name>`. */
export function passedTests(report: VitestReport, root: string): string[] {
  return report.testResults.flatMap((file) =>
    file.assertionResults
      .filter((test) => test.status === "passed")
      .map((test) => `${relative(root, file.name)} > ${test.fullName}`),
  );
}
