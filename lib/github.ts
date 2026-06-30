// Minimal GitHub Contents API client used by the admin "Name Feedback" panel
// to read/write public/name-dictionary-cleaned-suggestion.txt directly in
// urxio/contact-search. Requires a server-only GITHUB_TOKEN with repo write
// access (see .env.example).

const OWNER = "urxio"
const REPO = "contact-search"
const BRANCH = "main"
const DICTIONARY_PATH = "public/name-dictionary-cleaned-suggestion.txt"

function authHeaders() {
  const token = process.env.GITHUB_TOKEN
  if (!token) {
    throw new Error("GITHUB_TOKEN is not configured on the server")
  }
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  }
}

export async function getDictionaryFile(): Promise<{ lines: string[]; sha: string }> {
  const res = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/contents/${DICTIONARY_PATH}?ref=${BRANCH}`,
    { headers: authHeaders(), cache: "no-store" },
  )
  if (!res.ok) {
    throw new Error(`GitHub fetch failed (${res.status}): ${await res.text()}`)
  }
  const data = await res.json()
  const content = Buffer.from(data.content, "base64").toString("utf-8")
  const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  return { lines, sha: data.sha }
}

export async function updateDictionaryFile(lines: string[], sha: string, commitMessage: string): Promise<void> {
  const content = lines.join("\n") + "\n"
  const res = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/contents/${DICTIONARY_PATH}`,
    {
      method: "PUT",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        message: commitMessage,
        content: Buffer.from(content, "utf-8").toString("base64"),
        sha,
        branch: BRANCH,
      }),
    },
  )
  if (!res.ok) {
    throw new Error(`GitHub update failed (${res.status}): ${await res.text()}`)
  }
}
