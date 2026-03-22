import { NextRequest, NextResponse } from "next/server";
import { parseBillPDF } from "@/lib/parsers";
import { toBills } from "@/lib/parsers/adapter";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    const householdId = (form.get("householdId") as string | null) ?? "test";
    const storageRef  = (form.get("storageRef")  as string | null) ?? "test/upload.pdf";

    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await parseBillPDF(buffer);

    // If parsing succeeded, also run the adapter so callers get ready-to-store Bills
    if (result.success && result.bill) {
      const bills = toBills(result, { householdId, storageRef });
      return NextResponse.json({ ...result, bills });
    }

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
