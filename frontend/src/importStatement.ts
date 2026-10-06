export async function importStatement(file: File, account: string): Promise<{ message: string }> {
  const extension = file.name.match(/\.(csv|pdf)$/i)?.[1].toLowerCase();
  if (!extension) throw new Error("Obsługiwane pliki mają rozszerzenie CSV lub PDF.");
  const params = account ? `?account=${encodeURIComponent(account)}` : "";
  const response = await fetch(`/api/import${params}`, {
    method: "POST",
    headers: { "X-File-Name": `upload.${extension}` },
    body: file,
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      typeof result.detail === "string" ? result.detail : "Nie udało się wczytać pliku.",
    );
  return result;
}
