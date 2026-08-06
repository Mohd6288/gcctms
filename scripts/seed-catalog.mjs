#!/usr/bin/env node
// Ports the real GCC Lab course catalog (43 courses), job roles (22
// Distribution + 30 Transmission), prerequisites, eligible-job-role links,
// and regional day-rate pricing from the validated prototype
// (tms-prototype/src/data/mockData.ts) into a real gcctms Supabase project.
// Idempotent — safe to re-run against dev/staging/prod after `db push`.
//
// Usage: DATABASE_URL=<pooler connection string> node scripts/seed-catalog.mjs
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, and, isNull } from "drizzle-orm";
import * as catalogSchema from "../src/db/schema/catalog.ts";
import * as authSchema from "../src/db/schema/auth.ts";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const schema = { ...catalogSchema, ...authSchema };
const client = postgres(DATABASE_URL, { prepare: false });
const db = drizzle(client, { schema });
const { courses, courseJobRoles, coursePrerequisites, pricing } = catalogSchema;
const { jobRoles } = authSchema;

const REGIONAL_DAY_RATES = { Central: 500, East: 450, West: 550, South: 550, North: 500 };
const VALIDITY_MONTHS = 24; // matches certification/service.ts's +730 day cert expiry

const DIST_TITLES = [
  "Maintenance Electrician", "Vehicles Drivers", "Overhead Line Technician", "Meter Technician",
  "Cable Joint & Termination Technician (1KV)", "Cable Joint & Termination Technician (13.8KV)",
  "Cable Joint & Termination Technician (33KV)", "Cable Joint & Termination Technician (69KV)",
  "Leader Event & Event Officer", "Safety Coordinator / Representative", "Engineer & Supervisor",
  "Work Permit Receiver", "Meter Reader", "Craftsman (non-electric)", "Office Work", "Warehouse Guard",
  "Driver (not heavy vehicles)", "Cleaning Work", "Drilling Worker", "Civil", "Building Electrician",
  "Electrician Assistant",
];
const TRANS_TITLES = [
  "Vehicles Drivers", "Protection", "SCADA / SAS", "Communication", "Fire (Alarm & Fighting)", "Cables",
  "Transformer", "GIS", "Auxiliary (TR, AC/DC, Battery and Chargers)", "Auxiliary (Lighting & Power Sockets)",
  "HVAC", "Switchgear", "Transmission Line Rescue from Heights", "Transmission Lineman",
  "Safety Coordinator / Representative", "Work Permit Receiver", "Engineer & Supervisor",
  "Leader Event & Event Officer", "Civil", "Office Work", "Craftsman (non-electric)", "Warehouse Guard",
  "Driver (not heavy vehicles)", "Drilling Worker", "Cleaning Work", "Building Electrician",
  "Electrician Assistant", "Drone Pilot", "CCTV - Cable Pulling", "Cyber Security",
];

const JOB_ROLE_ROWS = [
  ...DIST_TITLES.map((title, i) => ({ code: `D${String(i + 1).padStart(2, "0")}`, title, category: "Distribution" })),
  ...TRANS_TITLES.map((title, i) => ({ code: `T${String(i + 1).padStart(2, "0")}`, title, category: "Transmission" })),
];

// [protoId, code, title, category(Distribution/Transmission/null=both), durationDays, description, eligibleJobRoles[], prerequisiteProtoIds[]]
const COURSES = [
  ["crs-cscc00", "CSCC00", "OHS General Induction", null, 1,
    "Mandatory occupational health & safety induction for all contractor personnel entering SEC facilities.",
    ["Maintenance Electrician","Vehicles Drivers","Overhead Line Technician","Meter Technician","Cable Joint & Termination Technician (1KV)","Cable Joint & Termination Technician (13.8KV)","Cable Joint & Termination Technician (33KV)","Cable Joint & Termination Technician (69KV)","Leader Event & Event Officer","Safety Coordinator / Representative","Engineer & Supervisor","Work Permit Receiver","Meter Reader","Craftsman (non-electric)","Warehouse Guard","Driver (not heavy vehicles)","Cleaning Work","Drilling Worker","Civil","Building Electrician","Electrician Assistant","Protection","SCADA / SAS","Communication","Fire (Alarm & Fighting)","Cables","Transformer","GIS","Auxiliary (TR, AC/DC, Battery and Chargers)","Auxiliary (Lighting & Power Sockets)","HVAC","Switchgear","Transmission Line Rescue from Heights","Transmission Lineman","Drone Pilot","CCTV - Cable Pulling","Cyber Security"],
    []],
  ["crs-cscc01", "CSCC01", "Hazard Identification & Risk Assessment", "Transmission", 2,
    "Systematic hazard identification and risk assessment methods for National Grid contractor personnel.",
    ["Protection","Cables","Transformer","GIS","Auxiliary (TR, AC/DC, Battery and Chargers)","Auxiliary (Lighting & Power Sockets)","HVAC","Switchgear","Transmission Line Rescue from Heights","Transmission Lineman","Safety Coordinator / Representative","Work Permit Receiver","Engineer & Supervisor","Craftsman (non-electric)","Warehouse Guard","Driver (not heavy vehicles)","Drilling Worker","Building Electrician","Electrician Assistant"],
    ["crs-cscc00"]],
  ["crs-cscc02", "CSCC02", "Safe Working Procedures for Electrical", "Distribution", 3,
    "Safe working procedures and isolation practices for Distribution contractor personnel working on or near electrical equipment.",
    ["Maintenance Electrician","Overhead Line Technician","Meter Technician","Cable Joint & Termination Technician (1KV)","Cable Joint & Termination Technician (13.8KV)","Cable Joint & Termination Technician (33KV)","Cable Joint & Termination Technician (69KV)","Building Electrician","Electrician Assistant"],
    ["crs-cscc00"]],
  ["crs-cscc03", "CSCC03", "Safe Working Procedures for Mechanical", null, 3,
    "Safe working procedures for mechanical works on SEC contractor sites, including isolation and lockout basics.",
    ["Vehicles Drivers","HVAC"],
    ["crs-cscc00"]],
  ["crs-cscc04", "CSCC04", "Distribution Safety Rules & Safe Isolation & Switching Procedures", "Distribution", 4,
    "Distribution network safety rules, safe isolation, and switching procedures for contractor electrical crews.",
    ["Safety Coordinator / Representative","Engineer & Supervisor","Work Permit Receiver"],
    ["crs-cscc00"]],
  ["crs-cscc05", "CSCC05", "National Grid Safety Rules, Qualification & Authorization", "Transmission", 4,
    "National grid safety rules, qualification, and authorization requirements for contractor personnel.",
    ["Work Permit Receiver","Drone Pilot"],
    ["crs-cscc00"]],
  ["crs-cscc08", "CSCC08", "NG Electrical Safe Working Procedures", "Transmission", 3,
    "National-grid-specific electrical safe working procedures for contractor crews on SEC facilities.",
    ["Protection","SCADA / SAS","Communication","Fire (Alarm & Fighting)","Cables","Transformer","GIS","Auxiliary (TR, AC/DC, Battery and Chargers)","Auxiliary (Lighting & Power Sockets)","Switchgear","Transmission Line Rescue from Heights","Transmission Lineman","Safety Coordinator / Representative","Engineer & Supervisor","Leader Event & Event Officer","Civil","Building Electrician","Electrician Assistant"],
    ["crs-cscc00"]],
  ["crs-cscc09", "CSCC09", "OHS General Induction incl. Office Safety", null, 1,
    "General OHS induction extended to cover office and administrative-site safety requirements.",
    ["Office Work"],
    []],
  ["crs-cscc10-dist", "CSCC10", "Construction Safety", "Distribution", 1,
    "Construction-site hazard awareness, PPE requirements, and SEC site safety regulations for Distribution contractors.",
    ["Civil"],
    ["crs-cscc00"]],
  ["crs-cscc10-trans", "CSCC10", "Construction Safety", "Transmission", 1,
    "Construction-site hazard awareness, PPE requirements, and SEC site safety regulations for National Grid contractors.",
    ["Civil"],
    ["crs-cscc08"]],
  ["crs-cscc11", "CSCC11", "Work at Heights (Fall Protection Program)", "Transmission", 2,
    "Fall protection, scaffold safety, and rope access fundamentals for work-at-height activities.",
    ["Transmission Line Rescue from Heights","Transmission Lineman","Engineer & Supervisor"],
    ["crs-cscc08"]],
  ["crs-cscc12", "CSCC12", "Scaffold Inspector", null, 2,
    "Scaffold inspection competency, tagging systems, and structural safety checks for site scaffolders.",
    [], ["crs-cscc00"]],
  ["crs-cscc13", "CSCC13", "OHS Representative", null, 2,
    "Duties and authority of a site OHS Representative under SEC contractor safety requirements.",
    [], ["crs-cscc00"]],
  ["crs-cscc14", "CSCC14", "Work Permit – Sender & Receiver", null, 1,
    "Permit-to-work issuance and receipt procedures for contractor supervisors and SEC-facing roles.",
    [], ["crs-cscc00"]],
  ["crs-cscc15", "CSCC15", "Lock Out Tag Out (LOTO) Procedures", null, 1,
    "Lock out / tag out isolation procedures for contractor personnel working on SEC plant and equipment.",
    [], ["crs-cscc00"]],
  ["crs-cscc17", "CSCC17", "Lifting Operations (As per scope of work)", "Transmission", 3,
    "Lifting operations safety, scoped to the specific lifting work being performed, for National Grid contractors.",
    ["Cables","Warehouse Guard","Driver (not heavy vehicles)"],
    ["crs-cscc01"]],
  ["crs-cscc18", "CSCC18", "Excavation Safety", null, 1,
    "Excavation hazard control, shoring, and safe digging practices near SEC underground services.",
    [], ["crs-cscc00"]],
  ["crs-cscc19", "CSCC19", "Confined Space Entry Program", "Transmission", 1,
    "Safe entry, monitoring, and rescue procedures for confined space work.",
    ["Cables","Transformer","GIS"],
    ["crs-cscc01"]],
  ["crs-cscc20", "CSCC20", "Projects Business Work Permit Issuer & Receiver", null, 2,
    "Work permit issuance and receipt procedures specific to projects-business contractor scopes.",
    [], ["crs-cscc00"]],
  ["crs-cscc21", "CSCC21", "Basic Fire Fighting", null, 1,
    "Fire prevention, extinguisher use, and site emergency evacuation procedures.",
    [], ["crs-cscc00"]],
  ["crs-cscc22", "CSCC22", "Basic First Aid", "Distribution", 1,
    "Basic first aid and emergency casualty care for Distribution contractor site first-responders.",
    ["Maintenance Electrician","Vehicles Drivers","Overhead Line Technician","Meter Technician","Cable Joint & Termination Technician (1KV)","Cable Joint & Termination Technician (13.8KV)","Cable Joint & Termination Technician (33KV)","Cable Joint & Termination Technician (69KV)","Leader Event & Event Officer","Safety Coordinator / Representative","Engineer & Supervisor","Work Permit Receiver","Meter Reader","Craftsman (non-electric)","Office Work","Warehouse Guard","Driver (not heavy vehicles)","Cleaning Work","Drilling Worker","Civil","Building Electrician","Electrician Assistant"],
    ["crs-cscc00"]],
  ["crs-cscc23", "CSCC23", "Defensive Driving", null, 1,
    "Defensive driving practices for personnel and light-vehicle operators on SEC contractor sites.",
    ["Driver (not heavy vehicles)","Vehicles Drivers","Warehouse Guard"],
    ["crs-cscc00"]],
  ["crs-cscc24", "CSCC24", "Basic Fire Fighting", "Transmission", 1,
    "Fire prevention, extinguisher use, and site emergency evacuation procedures for National Grid contractors.",
    ["Fire (Alarm & Fighting)"],
    ["crs-cscc00"]],
  ["crs-cscc25", "CSCC25", "ARC Flash Awareness", "Transmission", 1,
    "ARC flash hazard awareness and required PPE for personnel working near live electrical equipment.",
    ["Cables","Transformer","GIS","Switchgear","Transmission Line Rescue from Heights","Transmission Lineman"],
    ["crs-cscc01"]],
  ["crs-cscc26", "CSCC26", "Hazardous Chemical Substance Management", null, 1,
    "Safe handling, storage, and management of hazardous chemical substances on contractor sites.",
    [], ["crs-cscc00"]],
  ["crs-cscc27", "CSCC27", "SEC 5 Star OHS Management System", "Transmission", 2,
    "Contractor OHS management system requirements under SEC's 5 Star program.",
    ["Safety Coordinator / Representative"],
    ["crs-cscc00"]],
  ["crs-cscc28", "CSCC28", "Fire Suppression System Operation Basic Training", "Transmission", 1,
    "Basic operation of fixed fire suppression systems for National Grid contractor personnel.",
    ["Protection","SCADA / SAS","Communication","Cables","GIS","Auxiliary (TR, AC/DC, Battery and Chargers)","Auxiliary (Lighting & Power Sockets)","HVAC","Switchgear","Safety Coordinator / Representative","Work Permit Receiver","Engineer & Supervisor","Civil","Craftsman (non-electric)","Drilling Worker","Cleaning Work","Building Electrician","Electrician Assistant","CCTV - Cable Pulling","Cyber Security"],
    ["crs-cscc00"]],
  ["crs-cscc29", "CSCC29", "Excavation Safety", "Transmission", 1,
    "Excavation hazard control, shoring, and safe digging practices for National Grid contractors.",
    ["Cables"],
    ["crs-cscc01"]],
  ["crs-ctct01-dist", "CTCT01", "Electrical Equipment: Installation & Maintenance", "Distribution", 1,
    "Technical certification test covering installation and maintenance competency for electrical equipment, Distribution contractor track.",
    ["Maintenance Electrician","Building Electrician","Electrician Assistant"],
    ["crs-cscc02"]],
  ["crs-ctct01-trans", "CTCT01", "Electrical Equipment: Installation & Maintenance", "Transmission", 1,
    "Technical certification test covering installation and maintenance competency for electrical equipment, National Grid contractor track.",
    ["Protection","GIS","Auxiliary (TR, AC/DC, Battery and Chargers)","Auxiliary (Lighting & Power Sockets)","HVAC","Engineer & Supervisor","Building Electrician","Electrician Assistant"],
    ["crs-cscc08", "crs-cscc03"]],
  ["crs-ctct02", "CTCT02", "Heavy Vehicles Safe Operation", null, 1,
    "Technical certification test for safe operation of heavy vehicles on SEC contractor sites.",
    ["Vehicles Drivers"],
    ["crs-cscc03"]],
  ["crs-ctct03", "CTCT03", "Overhead Line: Installation & Maintenance", "Distribution", 1,
    "Technical certification test for overhead distribution line installation and maintenance competency.",
    ["Overhead Line Technician"],
    ["crs-cscc02"]],
  ["crs-ctct04", "CTCT04", "Energy Meter: Installation", "Distribution", 1,
    "Technical certification test for energy meter installation competency.",
    ["Meter Technician"],
    ["crs-cscc02"]],
  ["crs-ctct05", "CTCT05", "Energy Meter: Inspection & Maintenance", "Distribution", 1,
    "Technical certification test for energy meter inspection and maintenance competency.",
    ["Meter Technician"],
    ["crs-cscc02"]],
  ["crs-ctct06", "CTCT06", "Installation of Power Cable Joint and Termination – 1KV", "Distribution", 1,
    "Technical certification test for 1KV power cable joint and termination installation competency.",
    ["Cable Joint & Termination Technician (1KV)"],
    ["crs-cscc02"]],
  ["crs-ctct08", "CTCT08", "Installation of Power Cable Joint and Termination – 13.8KV", "Distribution", 1,
    "Technical certification test for 13.8KV power cable joint and termination installation competency.",
    ["Cable Joint & Termination Technician (13.8KV)"],
    ["crs-cscc02"]],
  ["crs-ctct10", "CTCT10", "Installation of Power Cable Joint and Termination – 33KV", "Distribution", 1,
    "Technical certification test for 33KV power cable joint and termination installation competency.",
    ["Cable Joint & Termination Technician (33KV)"],
    ["crs-cscc02"]],
  ["crs-ctct12", "CTCT12", "Installation of Power Cable Joint and Termination – 69KV", "Distribution", 2,
    "Technical certification test for 69KV power cable joint and termination installation competency.",
    ["Cable Joint & Termination Technician (69KV)"],
    ["crs-cscc02"]],
  ["crs-ctct18", "CTCT18", "Transformer Maintenance", "Transmission", 1,
    "Technical certification test for transformer maintenance competency, National Grid contractor track.",
    ["Transformer"],
    ["crs-cscc08"]],
  ["crs-ctct19", "CTCT19", "Switchgear & Circuit Breaker Maintenance", "Transmission", 1,
    "Technical certification test for switchgear and circuit breaker maintenance competency.",
    ["Switchgear"],
    ["crs-cscc08"]],
  ["crs-ctct20", "CTCT20", "Overhead Line Towers Risks Rescue Skills", "Transmission", 1,
    "Technical certification test for rescue skills from transmission line tower height risks.",
    ["Transmission Line Rescue from Heights"],
    ["crs-cscc11"]],
  ["crs-ctct21", "CTCT21", "Cable Optical Fiber: Joint & Termination", "Transmission", 1,
    "Technical certification test for optical fiber cable joint and termination competency.",
    ["Cables"],
    ["crs-cscc08"]],
  ["crs-ctct22", "CTCT22", "Overhead Transmission Line Installation & Maintenance", "Transmission", 1,
    "Technical certification test for overhead transmission line installation and maintenance competency.",
    ["Transmission Lineman"],
    ["crs-cscc11"]],
];

async function main() {
  console.log(`Seeding ${JOB_ROLE_ROWS.length} job roles...`);
  const jobRoleIdByKey = new Map(); // key = `${title}|${category}`
  for (const r of JOB_ROLE_ROWS) {
    const [existing] = await db.select().from(jobRoles).where(eq(jobRoles.code, r.code));
    let id = existing?.id;
    if (!id) {
      const [inserted] = await db
        .insert(jobRoles)
        .values({ code: r.code, nameEn: r.title, nameAr: r.title, contractorCategory: r.category, active: true })
        .returning({ id: jobRoles.id });
      id = inserted.id;
    }
    jobRoleIdByKey.set(`${r.title}|${r.category}`, id);
  }

  console.log(`Seeding ${COURSES.length} courses...`);
  const courseIdByProtoId = new Map();
  for (const [protoId, code, title, category, durationDays, description, eligibleRoles] of COURSES) {
    const whereClause = category
      ? and(eq(courses.code, code), eq(courses.contractorCategory, category))
      : and(eq(courses.code, code), isNull(courses.contractorCategory));
    const [existing] = await db.select().from(courses).where(whereClause);
    let id = existing?.id;
    if (!id) {
      const [inserted] = await db
        .insert(courses)
        .values({
          code,
          titleEn: title,
          titleAr: title, // no Arabic source text in the prototype — placeholder, needs real translation later
          description,
          durationHours: String(durationDays * 8),
          minAttendancePct: 90,
          validityMonths: VALIDITY_MONTHS,
          contractorCategory: category,
          active: true,
        })
        .returning({ id: courses.id });
      id = inserted.id;
    }
    courseIdByProtoId.set(protoId, id);

    // eligible job roles: match by title, scoped to the course's own category
    // when set; for a category-agnostic course, match the title in EITHER
    // category (a title can resolve to 1 or 2 real job_role rows).
    for (const title of eligibleRoles) {
      const candidateCategories = category ? [category] : ["Distribution", "Transmission"];
      for (const cat of candidateCategories) {
        const jobRoleId = jobRoleIdByKey.get(`${title}|${cat}`);
        if (!jobRoleId) continue;
        await db.insert(courseJobRoles).values({ courseId: id, jobRoleId }).onConflictDoNothing();
      }
    }
  }

  console.log("Linking prerequisites...");
  for (const [protoId, , , , , , , prereqProtoIds] of COURSES) {
    const courseId = courseIdByProtoId.get(protoId);
    for (const prereqProtoId of prereqProtoIds ?? []) {
      const prerequisiteCourseId = courseIdByProtoId.get(prereqProtoId);
      if (!prerequisiteCourseId) continue;
      await db.insert(coursePrerequisites).values({ courseId, prerequisiteCourseId }).onConflictDoNothing();
    }
  }

  console.log("Seeding regional pricing...");
  const today = new Date().toISOString().slice(0, 10);
  for (const [protoId, , , , durationDays] of COURSES) {
    const courseId = courseIdByProtoId.get(protoId);
    for (const [region, dayRate] of Object.entries(REGIONAL_DAY_RATES)) {
      await db
        .insert(pricing)
        .values({ courseId, region, price: String(durationDays * dayRate), currency: "SAR", effectiveFrom: today })
        .onConflictDoNothing();
    }
  }

  console.log("Done.");
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
