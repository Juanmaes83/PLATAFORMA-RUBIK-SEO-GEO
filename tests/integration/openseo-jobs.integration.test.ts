import { afterAll, beforeAll, expect, it } from "vitest";
import { RUN, createConfirmedUser, deleteOrganizations, deleteUsers, signedIn } from "./support";

const slug = `jobs-${RUN}`;
const users: string[] = [];
let projectId: string;

beforeAll(async () => {
  users.push(await createConfirmedUser("job-owner"), await createConfirmedUser("job-other"));
  const owner = await signedIn("job-owner");
  expect((await owner.from("organizations").insert({ slug, name: "Jobs fixture" })).error).toBeNull();
  const org = await owner.from("organizations").select("id").eq("slug", slug).single();
  expect(org.error).toBeNull();
  expect((await owner.from("projects").insert({ organization_id: org.data!.id, slug: "site", name: "Site" })).error).toBeNull();
  const project = await owner.from("projects").select("id").eq("organization_id", org.data!.id).single();
  expect(project.error).toBeNull();
  projectId = project.data!.id;
}, 60_000);

afterAll(async () => {
  await deleteOrganizations([slug]);
  await deleteUsers(users);
});

it("separate HTTP sessions acquire exactly one reservation; another client cannot release it", async () => {
  const clients = await Promise.all(Array.from({ length: 8 }, () => signedIn("job-owner")));
  const results = await Promise.all(clients.map(client => client.rpc("openseo_job", {
    p_project_id: projectId, p_command: "acquire",
  })));
  expect(results.every(result => result.error === null)).toBe(true);
  const jobs = results.map(result => result.data as { jobId: string; acquired: boolean; state: string });
  expect(new Set(jobs.map(job => job.jobId)).size).toBe(1);
  expect(jobs.filter(job => job.acquired)).toHaveLength(1);
  expect(jobs.every(job => job.state === "STARTING")).toBe(true);
  const other = await signedIn("job-other");
  const rejected = await other.rpc("openseo_job", {
    p_project_id: projectId, p_command: "fail", p_job_id: jobs[0].jobId,
  });
  expect(rejected.error?.code).toBe("42501");
  const current = await clients[0].rpc("openseo_job", {
    p_project_id: projectId, p_command: "get", p_job_id: jobs[0].jobId,
  });
  expect(current.error).toBeNull();
  expect(current.data).toMatchObject({ state: "STARTING", jobId: jobs[0].jobId });
}, 60_000);
