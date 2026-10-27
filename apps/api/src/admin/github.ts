// A small GitHub client for the Developer page. Read what is happening in the repository, and start the deploy
// workflow. Nothing here can change code: the token should not be able to (see the integration's hint).

export interface RepoRef { owner: string; name: string }
export const parseRepo = (s: string): RepoRef | null => { const m = /^([\w.-]+)\/([\w.-]+)$/.exec(s.trim()); return m ? { owner: m[1], name: m[2] } : null; };

export class GitHubError extends Error { constructor(public readonly status: number, message: string) { super(message); } }

export class GitHub {
  constructor(private readonly token: string, private readonly repo: RepoRef, private readonly f: typeof fetch = fetch) {}

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.f(`https://api.github.com/repos/${this.repo.owner}/${this.repo.name}${path}`, {
      method, signal: AbortSignal.timeout(15_000),
      headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'saathi-admin', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    const json = text ? JSON.parse(text) : undefined;
    if (!res.ok) throw new GitHubError(res.status, res.status === 401 ? 'GitHub rejected the token.' : res.status === 404 ? 'GitHub can’t find that repository or workflow, or the token can’t see it.' : (json?.message as string) ?? `GitHub answered ${res.status}.`);
    return json as T;
  }

  async overview() {
    const [repo, commits, pulls, runs, workflows] = await Promise.all([
      this.call<{ full_name: string; default_branch: string; html_url: string; private: boolean; pushed_at: string; open_issues_count: number }>('GET', ''),
      this.call<{ sha: string; html_url: string; commit: { message: string; author: { name: string; date: string } } }[]>('GET', '/commits?per_page=10'),
      this.call<{ number: number; title: string; html_url: string; user: { login: string }; draft: boolean; updated_at: string; head: { ref: string } }[]>('GET', '/pulls?state=open&per_page=10'),
      this.call<{ workflow_runs: { id: number; name: string; display_title: string; status: string; conclusion: string | null; head_branch: string; head_sha: string; event: string; html_url: string; created_at: string; run_started_at: string; updated_at: string }[] }>('GET', '/actions/runs?per_page=12'),
      this.call<{ workflows: { id: number; name: string; path: string; state: string }[] }>('GET', '/actions/workflows'),
    ]);
    return {
      repo: { name: repo.full_name, defaultBranch: repo.default_branch, url: repo.html_url, private: repo.private, pushedAt: repo.pushed_at },
      commits: commits.map(c => ({ sha: c.sha.slice(0, 7), message: c.commit.message.split('\n')[0].slice(0, 120), author: c.commit.author.name, at: c.commit.author.date, url: c.html_url })),
      pulls: pulls.map(p => ({ number: p.number, title: p.title.slice(0, 120), author: p.user.login, draft: p.draft, branch: p.head.ref, updatedAt: p.updated_at, url: p.html_url })),
      runs: runs.workflow_runs.map(r => ({ id: r.id, workflow: r.name, title: r.display_title.slice(0, 100), status: r.status, conclusion: r.conclusion, branch: r.head_branch, sha: r.head_sha.slice(0, 7), event: r.event, startedAt: r.run_started_at, updatedAt: r.updated_at, url: r.html_url })),
      workflows: workflows.workflows.map(w => ({ id: w.id, name: w.name, file: w.path.split('/').pop(), state: w.state })),
    };
  }

  /** Starts .github/workflows/deploy.yml with the chosen environment and ref. */
  dispatchDeploy(environment: string, ref: string) {
    return this.call<void>('POST', '/actions/workflows/deploy.yml/dispatches', { ref, inputs: { environment, ref } });
  }

  rerun(runId: number) { return this.call<void>('POST', `/actions/runs/${runId}/rerun`); }
}
