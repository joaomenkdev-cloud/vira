import { beforeEach, describe, expect, it, vi } from "vitest";

import { reportError } from "../observability/error-reporting.js";
import { reportLoggedError } from "./pino-options.js";

vi.mock("../observability/error-reporting.js", () => ({ reportError: vi.fn() }));

const ERROR = 50;
const FATAL = 60;
const WARN = 40;

describe("reportLoggedError", () => {
  beforeEach(() => {
    vi.mocked(reportError).mockClear();
  });

  it("reports the error of a line at error level or above", () => {
    const err = new Error("boom");
    reportLoggedError({ err }, ERROR);
    reportLoggedError({ err }, FATAL);
    expect(reportError).toHaveBeenCalledTimes(2);
    expect(reportError).toHaveBeenCalledWith(err);
  });

  it("ignores lower levels, lines without an error and the access line of the request", () => {
    reportLoggedError({ err: new Error("retrying") }, WARN);
    reportLoggedError({ handler: "X.y" }, ERROR);
    reportLoggedError({ err: "not an error" }, ERROR);
    reportLoggedError("a plain message", ERROR);
    reportLoggedError({ err: new Error("boom"), res: { statusCode: 500 } }, ERROR);
    expect(reportError).not.toHaveBeenCalled();
  });
});
