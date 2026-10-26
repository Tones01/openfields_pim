import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireMember } from "@/lib/auth";
import { ProductForm } from "@/components/ProductForm";

export default async function NewProductPage() {
  const me = await requireMember();
  if (!me.canEdit) redirect("/");
  const supabase = await createClient();
  const { data: options } = await supabase.rpc("field_options");
  return <ProductForm product={null} options={(options ?? {}) as Record<string, string[]>} canEdit mode="new" />;
}
