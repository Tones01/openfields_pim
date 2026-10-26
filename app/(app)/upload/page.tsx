import { redirect } from "next/navigation";
import { requireMember } from "@/lib/auth";
import { BulkUpload } from "@/components/BulkUpload";

export default async function UploadPage() {
  const me = await requireMember();
  if (!me.canEdit) redirect("/");
  return (
    <main className="page">
      <div className="page-head">
        <h1>Bulk upload</h1>
        <p className="muted">
          Upload a filled-in intake form or any product spreadsheet (.xlsx or .csv). You'll check the columns and see
          every problem before anything is saved. Blank cells never wipe out existing info.{" "}
          <a href="/api/template">Download the blank template</a>.
        </p>
      </div>
      <BulkUpload />
    </main>
  );
}
