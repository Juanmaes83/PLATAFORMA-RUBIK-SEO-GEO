// F1 demo seed: a fictitious multi-client portfolio in the LOCAL Supabase stack only.
// `localSupabaseEnv()` refuses any non-local endpoint, so this script can never write to a
// hosted project. All people, organizations, projects and findings are invented demo data
// (emails under rubik-demo.test, domains under ejemplo.test). Run:
//   node scripts/demo-f1-data.mjs            → clean previous demo data, then seed
//   node scripts/demo-f1-data.mjs --cleanup  → remove demo data only
// The generated passphrase is printed once and never written to disk.
import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { localDatabaseContainer, localSupabaseEnv } from "./supabase-test-env.mjs";

const EMAILS = {
  agency: "demo-agencia@rubik-demo.test",
  client: "demo-cliente@rubik-demo.test",
  analyst: "demo-analista@rubik-demo.test",
};
const ORG_SLUGS = ["demo-agencia", "demo-holding"];

const must = (result, what) => {
  if (result.error) throw new Error(`${what}: ${result.error.message ?? JSON.stringify(result.error)}`);
  return result.data;
};

function importRow({ project, org, createdBy, source, capturedAt, findings }) {
  const payload = JSON.stringify({
    format: "rubik-import-v1",
    scope: { tenantId: org.id, projectId: project.id },
    source,
    capturedAt,
    findings,
  });
  const bytes = Buffer.byteLength(payload);
  return {
    project_id: project.id,
    organization_id: org.id,
    format: "rubik-import-v1",
    source_kind: source.kind,
    source_label: source.label,
    source_url: source.url ?? null,
    source_tool: source.tool ?? null,
    captured_at: capturedAt,
    period_start: null,
    period_end: null,
    status: "complete",
    finding_count: findings.length,
    error_count: 0,
    findings,
    errors: [],
    file_sha256: createHash("sha256").update(payload).digest("hex"),
    file_bytes: bytes,
    created_by: createdBy,
  };
}

const finding = (url, ruleId, severity, title, observation, proposal = null, status = "open") => ({
  url, ruleId, severity, title, observation, proposal, status,
});

function hotelImports(project, org, createdBy) {
  const base = "https://hotel-playa.ejemplo.test";
  return [
    importRow({
      project, org, createdBy,
      source: { kind: "audit", label: "Auditoría técnica de octubre (demo)", tool: "revisión manual" },
      capturedAt: "2026-10-20T09:30:00+02:00",
      findings: [
        finding(`${base}/`, "meta-title-length", "medium", "Título de portada demasiado largo",
          "El título supera los 60 caracteres recomendados.", "Reducir el título a marca + propuesta de valor."),
        finding(`${base}/habitaciones`, "img-missing-alt", "high", "Imágenes de habitaciones sin texto alternativo",
          "14 imágenes de la galería no declaran atributo alt.", "Describir cada habitación en el alt."),
        finding(`${base}/reservas`, "heading-order", "low", "Jerarquía de encabezados rota",
          "La página salta de h1 a h3 sin h2 intermedio."),
      ],
    }),
    importRow({
      project, org, createdBy,
      source: { kind: "crawl-export", label: "Exportación de rastreo (demo)", tool: "Screaming Frog",
        url: base },
      capturedAt: "2026-10-25T18:05:00+02:00",
      findings: [
        finding(`${base}/ofertas`, "status-404-in-sitemap", "critical", "URL del sitemap devuelve 404",
          "/ofertas aparece en el sitemap pero responde 404.", "Eliminar la URL del sitemap o restaurar la página."),
        finding(`${base}/blog/mejores-playas`, "canonical-mismatch", "high", "Canonical apunta a otra URL",
          "El canonical declara la versión en inglés sin hreflang recíproco."),
        finding(`${base}/spa`, "meta-description-duplicate", "medium", "Metadescripción duplicada",
          "Comparte metadescripción con /wellness.", "Redactar una descripción única para /spa."),
        finding(`${base}/contacto`, "title-duplicate", "low", "Título duplicado con /reservas",
          "Ambas páginas usan «Contacto — Hotel Playa Azul».", null, "resolved"),
      ],
    }),
    importRow({
      project, org, createdBy,
      source: { kind: "offpage-inventory", label: "Inventario de enlaces (demo)", tool: "revisión manual" },
      capturedAt: "2026-10-28T11:15:00+02:00",
      findings: [
        finding(`${base}/`, "backlink-anchor-generic", "info", "Anclas genéricas predominantes",
          "El 60 % de los enlaces entrantes usan «haz clic aquí»."),
        finding(`${base}/habitaciones/suite`, "backlink-lost", "medium", "Enlace perdido desde guía local",
          "La guía turística municipal retiró el enlace en octubre.", "Contactar con el ayuntamiento para reponerlo."),
      ],
    }),
  ];
}

function clinicaImports(project, org, createdBy) {
  const base = "https://clinica-dental.ejemplo.test";
  return [
    importRow({
      project, org, createdBy,
      source: { kind: "manual-review", label: "Revisión de contenidos (demo)", tool: "revisión manual" },
      capturedAt: "2026-10-15T10:00:00+02:00",
      findings: [
        finding(`${base}/tratamientos/implantes`, "content-thin", "high", "Contenido escaso en implantes",
          "La página tiene 120 palabras y ninguna pregunta frecuente.",
          "Ampliar con proceso, precios orientativos y FAQ."),
        finding(`${base}/equipo`, "structured-data-missing", "medium", "Falta marcado de organización médica",
          "No se declara Physician/MedicalBusiness en datos estructurados."),
      ],
    }),
  ];
}

async function cleanup(admin) {
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const demoUsers = (list?.users ?? []).filter((u) => Object.values(EMAILS).includes(u.email));
  for (const orgSlug of ORG_SLUGS) {
    // Cascades to members, projects and imports.
    await admin.from("organizations").delete().eq("slug", orgSlug);
  }
  for (const user of demoUsers) {
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) throw new Error(`deleteUser ${user.email}: ${error.message}`);
  }
  return demoUsers.length;
}

async function seed(admin) {
  const passphrase = process.env.RUBIK_DEMO_PASSPHRASE || randomBytes(12).toString("base64url");
  const users = {};
  for (const [key, email] of Object.entries(EMAILS)) {
    const data = must(await admin.auth.admin.createUser({
      email, password: passphrase, email_confirm: true, app_metadata: { rubik_demo_f1: true },
    }), `createUser ${email}`);
    users[key] = data.user;
  }

  const agency = users.agency;
  const orgAgencia = must(await admin.from("organizations")
    .insert({ slug: "demo-agencia", name: "Agencia Meridian (demo)", created_by: agency.id })
    .select("id, slug").single(), "insert demo-agencia");
  const orgHolding = must(await admin.from("organizations")
    .insert({ slug: "demo-holding", name: "Grupo Serrano (demo)", created_by: agency.id })
    .select("id, slug").single(), "insert demo-holding");
  // The organizations trigger has already added the agency user as owner of both orgs.

  const projects = {};
  for (const [key, org, slug, name, domain, vertical] of [
    ["hotel", orgAgencia, "hotel-playa", "Hotel Playa Azul (demo)", "hotel-playa.ejemplo.test", "Hostelería"],
    ["clinica", orgAgencia, "clinica-dental", "Clínica Dental Norte (demo)", "clinica-dental.ejemplo.test", "Salud"],
    ["taller", orgAgencia, "taller-rueda", "Taller Rueda Libre (demo)", "taller-rueda.ejemplo.test", "Automoción"],
    ["legal", orgHolding, "serrano-legal", "Serrano Legal (demo)", "serrano-legal.ejemplo.test", "Legal"],
  ]) {
    projects[key] = must(await admin.from("projects")
      .insert({ organization_id: org.id, slug, name, domain, vertical })
      .select("id, slug, organization_id").single(), `insert ${slug}`);
  }

  const orgMembers = [
    { organization_id: orgAgencia.id, user_id: users.client.id, role: "member" },
    { organization_id: orgAgencia.id, user_id: users.analyst.id, role: "member" },
  ];
  must(await admin.from("organization_members").insert(orgMembers), "organization_members");

  const projectMembers = [
    ...Object.values(projects).map((p) => ({
      project_id: p.id, organization_id: p.organization_id, user_id: agency.id, role: "owner",
    })),
    { project_id: projects.hotel.id, organization_id: orgAgencia.id, user_id: users.client.id, role: "client-approver" },
    { project_id: projects.clinica.id, organization_id: orgAgencia.id, user_id: users.analyst.id, role: "analyst" },
    { project_id: projects.taller.id, organization_id: orgAgencia.id, user_id: users.analyst.id, role: "analyst" },
  ];
  must(await admin.from("project_members").insert(projectMembers), "project_members");

  const imports = [
    ...hotelImports(projects.hotel, orgAgencia, agency.id),
    ...clinicaImports(projects.clinica, orgAgencia, agency.id),
  ];
  if (process.env.RUBIK_TEST_F1A2_STACK === "1") {
    // Dedicated disposable visual stack only. The existing offline-restore boundary permits
    // postgres without JWT; preserve every RLS policy and trigger, and validate the container.
    const columns = Object.keys(imports[0]).join(",");
    const data = JSON.stringify(imports).replaceAll("'", "''");
    execFileSync("docker", ["exec", "-i", localDatabaseContainer(), "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], {
      input: `insert into public.imports (${columns}) select ${columns} from jsonb_populate_recordset(null::public.imports, '${data}'::jsonb);`, stdio: ["pipe", "ignore", "pipe"],
    });
  } else {
    must(await admin.from("imports").insert(imports), "imports");
  }
  return { passphrase, orgAgencia, orgHolding, projects };
}

const env = localSupabaseEnv();
const admin = createClient(env.apiUrl, env.secretKey, { auth: { persistSession: false, autoRefreshToken: false } });

if (process.argv.includes("--cleanup")) {
  const removed = await cleanup(admin);
  console.log(`Demo F1: datos eliminados (${removed} usuarios demo y organizaciones ${ORG_SLUGS.join(", ")}).`);
} else {
  const removed = await cleanup(admin);
  const { passphrase, orgAgencia, orgHolding, projects } = await seed(admin);
  console.log(`Demo F1 sembrada en el stack local (${removed} usuarios demo previos eliminados).\n`);
  console.log("Contraseña común (solo esta ejecución, no se guarda en disco):");
  console.log(`  ${passphrase}\n`);
  console.log("Usuarios:");
  console.log(`  Agencia  ${EMAILS.agency}  → cartera completa (4 proyectos, 2 organizaciones)`);
  console.log(`  Cliente  ${EMAILS.client}  → solo Hotel Playa Azul (aprobador)`);
  console.log(`  Analista ${EMAILS.analyst} → Clínica Dental Norte y Taller Rueda Libre\n`);
  console.log("Proyectos con datos de demostración:");
  console.log(`  Hotel Playa Azul    /proyectos/${orgAgencia.id}/${projects.hotel.id}  (3 importaciones)`);
  console.log(`  Clínica Dental Norte /proyectos/${orgAgencia.id}/${projects.clinica.id} (1 importación)`);
  console.log(`  Sin datos: Taller Rueda Libre (${orgAgencia.slug}), Serrano Legal (${orgHolding.slug})`);
}
