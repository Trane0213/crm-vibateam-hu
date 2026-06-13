/**
 * Companies domain — szerveroldali read API.
 * Minden hívás `requireSupabaseAuth` middleware-en megy keresztül, az RLS
 * a hívó user nevében dönt.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/middleware";

const listInput = z.object({
  search: z.string().trim().max(200).optional().default(""),
  companyType: z.string().trim().max(64).optional().default(""),
  city: z.string().trim().max(120).optional().default(""),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(50),
  sort: z.enum(["name", "created_at", "updated_at"]).default("name"),
  ascending: z.boolean().default(true),
});

export const listCompanies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => listInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;
    let q = supabase
      .from("companies")
      .select(
        "id, name, website, city, tax_number, company_type, notes, created_at, updated_at",
        { count: "exact" },
      )
      .order(data.sort, { ascending: data.ascending })
      .range(from, to);
    if (data.search) {
      const s = `%${data.search}%`;
      q = q.or(
        `name.ilike.${s},website.ilike.${s},city.ilike.${s},tax_number.ilike.${s}`,
      );
    }
    if (data.companyType) q = q.eq("company_type", data.companyType);
    if (data.city) q = q.eq("city", data.city);
    const { data: rows, count, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [], total: count ?? 0, page: data.page, pageSize: data.pageSize };
  });

const getInput = z.object({ id: z.string().uuid() });

export const getCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => getInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: company, error } = await supabase
      .from("companies")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!company) throw new Response("Not found", { status: 404 });

    const [contactsRes, leadsRes, threadsRes, projectsRes] = await Promise.all([
      supabase
        .from("contacts")
        .select("id, name, email, phone, role")
        .eq("company_id", data.id),
      supabase
        .from("leads")
        .select("id, status, source, created_at")
        .eq("company_id", data.id),
      supabase
        .from("email_threads")
        .select("id, subject, last_message_at")
        .eq("company_id", data.id)
        .order("last_message_at", { ascending: false })
        .limit(20),
      supabase
        .from("projects")
        .select("id, name, status, created_at")
        .eq("company_id", data.id),
    ]);

    return {
      company,
      contacts: contactsRes.data ?? [],
      leads: leadsRes.data ?? [],
      threads: threadsRes.data ?? [],
      projects: projectsRes.data ?? [],
    };
  });