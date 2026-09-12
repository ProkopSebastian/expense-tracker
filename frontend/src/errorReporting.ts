export interface ClientErrorReport {
  message: string;
  stack?: string;
  component_stack?: string;
  url?: string;
}

export async function reportError(report: ClientErrorReport): Promise<boolean> {
  try {
    const response = await fetch("/report-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stack: "",
        component_stack: "",
        url: window.location.href,
        ...report,
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
