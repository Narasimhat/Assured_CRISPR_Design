from pathlib import Path
from openpyxl import Workbook
import csv


OUT_DIR = Path(r"C:\Users\ntelugu\Documents\Claude\Projects\CRISPR_Editing")

DESIGNS = [
    {
        "slot": "1",
        "design_label": "SCN5A P155-SPOT-W156 internal KI",
        "gene": "SCN5A",
        "design_type": "Internal tag knockin",
        "reference_file": "scn5a-ensg00000183873.gb",
        "mutation_edit": "Insert SPOT after P155, before W156",
        "cell_line": "n/a",
        "notes": "Internal in-frame ssODN KI. Built from SCN5A-001 genomic context and Horizon construct placement.",
        "guide_rows": [
            {
                "name": "SCN5A_P155_SPOT_gRNA1",
                "spacer": "TCGACATACTTGGTCCAGGG",
                "pam": "TGG",
                "strand": "-",
                "gc": "55%",
                "notes": "Primary guide. Cut exactly at the insertion junction.",
                "recommended": "Yes",
            },
            {
                "name": "SCN5A_P155_SPOT_gRNA2",
                "spacer": "CCCAGCACGACCCTCCACCC",
                "pam": "TGG",
                "strand": "+",
                "gc": "75%",
                "notes": "Backup guide. Cut 3 bp upstream of the insertion junction.",
                "recommended": "Backup",
            },
            {
                "name": "SCN5A_P155_SPOT_gRNA3",
                "spacer": "CACTCGACATACTTGGTCCA",
                "pam": "GGG",
                "strand": "-",
                "gc": "50%",
                "notes": "Backup guide. Cut 3 bp downstream of the insertion junction.",
                "recommended": "Backup",
            },
        ],
        "primer_rows": [
            {"name": "SCN5A_P155_SPOT_Fw", "sequence": "GAAAGAGACCAGCCTGGGTGGAGG"},
            {"name": "SCN5A_P155_SPOT_Rev", "sequence": "ACTTTCTACTTTGCCACTCTGGAG"},
        ],
        "amplicon": "WT ~520 bp | KI ~555 bp",
        "donor_name": "SCN5A_P155_SPOT_ssODN1",
        "linked_guide": "SCN5A_P155_SPOT_gRNA1",
        "donor_notes": "Recommended order strand. Includes silent seed change T157 ACC->ACA to reduce re-cutting.",
        "insert_label": "SPOT",
        "insert_sequence": "GACCGCGTGCGCGCCGTGAGCCATTGGAGCAGC",
        "homology_5": "TCATCATGTGCACCATCCTCACCAACTGCGTGTTCATGGCCCAGCACGACCCTCCACCCT",
        "homology_3": "GGACAAAGTATGTCGAGTGAGTATCTTCAGGGCCTCTTCTCCACGTGGCCCCCTCCCTTC",
        "donor_sequence": "TCATCATGTGCACCATCCTCACCAACTGCGTGTTCATGGCCCAGCACGACCCTCCACCCTGACCGCGTGCGCGCCGTGAGCCATTGGAGCAGCGGACAAAGTATGTCGAGTGAGTATCTTCAGGGCCTCTTCTCCACGTGGCCCCCTCCCTTC",
        "ssodn_notes": [
            "Desired edit 1: in-frame SPOT insertion after P155, before W156.",
            "SCN5A_P155_SPOT_gRNA1: p.T157T (ACC -> ACA) | seed-disrupting silent mutation",
        ],
    },
    {
        "slot": "2",
        "design_label": "SCN5A W156-alphaBungarotoxin-T157 internal KI",
        "gene": "SCN5A",
        "design_type": "Internal tag knockin",
        "reference_file": "scn5a-ensg00000183873.gb",
        "mutation_edit": "Insert alphaBungarotoxin after W156, before T157",
        "cell_line": "n/a",
        "notes": "Internal in-frame ssODN KI. Built from SCN5A-001 genomic context and Horizon construct placement.",
        "guide_rows": [
            {
                "name": "SCN5A_W156_alphaBtx_gRNA1",
                "spacer": "CACTCGACATACTTGGTCCA",
                "pam": "GGG",
                "strand": "-",
                "gc": "50%",
                "notes": "Primary guide. Cut exactly at the insertion junction.",
                "recommended": "Yes",
            },
            {
                "name": "SCN5A_W156_alphaBtx_gRNA2",
                "spacer": "TCGACATACTTGGTCCAGGG",
                "pam": "TGG",
                "strand": "-",
                "gc": "55%",
                "notes": "Backup guide. Cut 3 bp upstream of the insertion junction.",
                "recommended": "Backup",
            },
            {
                "name": "SCN5A_W156_alphaBtx_gRNA3",
                "spacer": "CCCAGCACGACCCTCCACCC",
                "pam": "TGG",
                "strand": "+",
                "gc": "75%",
                "notes": "Backup guide. Cut 6 bp upstream of the insertion junction.",
                "recommended": "Backup",
            },
        ],
        "primer_rows": [
            {"name": "SCN5A_W156_alphaBtx_Fw", "sequence": "AGAGACCAGCCTGGGTGGAGGGGG"},
            {"name": "SCN5A_W156_alphaBtx_Rev", "sequence": "GAAACTTTCTACTTTGCCACTCTG"},
        ],
        "amplicon": "WT ~520 bp | KI ~556 bp",
        "donor_name": "SCN5A_W156_alphaBtx_ssODN1",
        "linked_guide": "SCN5A_W156_alphaBtx_gRNA1",
        "donor_notes": "Recommended order strand. Includes silent seed change K158 AAG->AAA to reduce re-cutting.",
        "insert_label": "alphaBungarotoxin",
        "insert_sequence": "CGATACTATGAAAGCAGTCTAGAGCCTTACCCAGAC",
        "homology_5": "TCATGTGCACCATCCTCACCAACTGCGTGTTCATGGCCCAGCACGACCCTCCACCCTGGA",
        "homology_3": "CCAAATATGTCGAGTGAGTATCTTCAGGGCCTCTTCTCCACGTGGCCCCCTCCCTTCCTT",
        "donor_sequence": "TCATGTGCACCATCCTCACCAACTGCGTGTTCATGGCCCAGCACGACCCTCCACCCTGGACGATACTATGAAAGCAGTCTAGAGCCTTACCCAGACCCAAATATGTCGAGTGAGTATCTTCAGGGCCTCTTCTCCACGTGGCCCCCTCCCTTCCTT",
        "ssodn_notes": [
            "Desired edit 1: in-frame alphaBungarotoxin insertion after W156, before T157.",
            "SCN5A_W156_alphaBtx_gRNA1: p.K158K (AAG -> AAA) | seed-disrupting silent mutation",
        ],
    },
]


def render_guide_sequence(spacer: str, pam: str) -> str:
    return f'<span style="font-family:Consolas,monospace;font-weight:700;color:#111827;">{spacer}</span> <span style="display:inline-block;padding:1px 6px;border-radius:999px;background:#FEF3C7;color:#92400E;font-family:Consolas,monospace;font-weight:800;">{pam}</span>'


def table_html(rows, header=False):
    items = []
    for row in rows:
        cells = []
        for index, cell in enumerate(row):
            if header:
                cells.append(f'<th style="padding:8px 10px;border:1px solid #bbbbbb;background:#2E75B6;color:#ffffff;text-align:left;">{cell}</th>')
            else:
                styles = 'padding:8px 10px;border:1px solid #bbbbbb;vertical-align:top;'
                if index == 0:
                    styles += 'background:#F0F4F8;font-weight:700;width:220px;'
                else:
                    styles += 'background:#FFFFFF;'
                cells.append(f'<td style="{styles}">{cell}</td>')
        items.append(f"<tr>{''.join(cells)}</tr>")
    return "".join(items)


def build_report_html():
    sections = []
    for design in DESIGNS:
        header_rows = [
            ["Group", "AG Stem Cell Core Facility"],
            ["IRIS ID", "[to be assigned]"],
            ["Mutation / edit", design["mutation_edit"]],
            ["Cell line", design["cell_line"]],
        ]
        gene_rows = [
            ["Gene", design["gene"]],
            ["Design class", design["design_type"]],
            ["Target", design["mutation_edit"]],
            ["Cell line", design["cell_line"]],
            ["Protein / CDS", "SCN5A-001 / internal insertion"],
            ["Reference file", design["reference_file"]],
        ]
        guide_rows = [[g["name"], render_guide_sequence(g["spacer"], g["pam"]), f'{g["strand"]} strand', g["gc"], g["notes"]] for g in design["guide_rows"]]
        primer_rows = [[p["name"], p["sequence"]] for p in design["primer_rows"]]
        donor_html = f"""
<div style="margin:0 0 14px 0;padding:12px;border:1px solid #d7dee7;border-radius:12px;background:#f8fafc;">
  <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px;">
    <span style="display:inline-flex;align-items:center;padding:4px 8px;border-radius:999px;font-size:11px;font-weight:700;color:#2563EB;background:#DBEAFE;">5' HA ({len(design['homology_5'])} bp)</span>
    <span style="display:inline-flex;align-items:center;padding:4px 8px;border-radius:999px;font-size:11px;font-weight:700;color:#B45309;background:#FDE68A;">{design['insert_label']} ({len(design['insert_sequence'])} bp)</span>
    <span style="display:inline-flex;align-items:center;padding:4px 8px;border-radius:999px;font-size:11px;font-weight:700;color:#047857;background:#DCFCE7;">3' HA ({len(design['homology_3'])} bp)</span>
  </div>
  <div style="color:#667085;font-size:11px;margin-bottom:4px;">Annotated donor</div>
  <div style="font-family:Consolas,monospace;font-size:12px;line-height:1.7;white-space:pre-wrap;overflow-wrap:anywhere;">
    <span style="color:#2563EB;font-weight:700;">{design['homology_5']}</span><span style="color:#B45309;font-weight:700;">{design['insert_sequence']}</span><span style="color:#047857;font-weight:700;">{design['homology_3']}</span>
  </div>
</div>
"""
        ssodn_notes = "".join([f'<p style="color:#CC0000;font-weight:700;margin:6px 0;">{line}</p>' for line in design["ssodn_notes"]])
        sections.append(f"""
  <div style="page-break-after:always;">
    <table>{table_html(header_rows)}</table>
    <h1>Design: {design["design_label"]}</h1>
    <p class="sub">{design["notes"]}</p>
    <h2>1. Gene Information</h2>
    <table>{table_html(gene_rows)}</table>
    <h2>2. gRNA Sequences</h2>
    <table>{table_html([["Name", "Sequence", "Strand", "GC", "Notes"]], True)}{table_html(guide_rows)}</table>
    <h2>3. Validation Primers</h2>
    <table>{table_html([["Name", "Sequence"]], True)}{table_html(primer_rows)}</table>
    <p class="sub">Expected amplicon: {design["amplicon"]}</p>
    <h2>4. ssODN Donor Templates</h2>
    <p class="note">WT and donor templates are listed together for review. The donor shown here is the recommended order strand.</p>
    {donor_html}
    <p style="font-size:12px;color:#555;margin:0 0 8px 0;">Donor name: {design["donor_name"]} | Linked guide: {design["linked_guide"]}</p>
    <p style="font-family:Consolas,monospace;font-size:13px;word-break:break-all;">{design["donor_sequence"]}</p>
    {ssodn_notes}
    <h2>5. Review Checkpoints</h2>
    <ul style="padding-left:18px;">
      <li style="margin:0 0 8px 0;color:#344054;"><strong>Check:</strong> Confirm the internal insertion remains in frame across both junctions.</li>
      <li style="margin:0 0 8px 0;color:#344054;"><strong>Check:</strong> Confirm the tag placement matches the Horizon construct strategy at P155/W156.</li>
      <li style="margin:0 0 8px 0;color:#344054;"><strong>Check:</strong> Confirm the donor does not disrupt local SCN5A function required for the assay.</li>
      <li style="margin:0 0 8px 0;color:#344054;"><strong>Check:</strong> Order the primary guide first; keep backup guides only if pilot optimization is needed.</li>
    </ul>
    <h2>6. Additional Info</h2>
    <p>Primary guide: {design["guide_rows"][0]["name"]}<br/>Donor note: {design["donor_notes"]}</p>
  </div>
""")

    return f"""<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>SCN5A internal tag ssODN design package</title>
<style>
body{{font-family:Calibri,Arial,sans-serif;margin:24px;color:#333}}
h1{{font-size:24px;margin:18px 0 4px 0}}
h2{{font-size:18px;margin:20px 0 10px 0;color:#1f2937}}
h3{{font-size:15px}}
table{{border-collapse:collapse;width:100%;margin:8px 0 14px 0}}
p{{font-size:13px;line-height:1.45}}
.sub{{color:#555;font-size:13px}}
.note{{color:#555;font-style:italic}}
</style>
</head>
<body>
{''.join(sections)}
</body>
</html>"""


def write_xlsx(path: Path, headers, rows):
    workbook = Workbook()
    ws = workbook.active
    ws.title = "Sheet1"
    ws.append(headers)
    for row in rows:
        ws.append([row.get(h, "") for h in headers])
    workbook.save(path)


def main():
    html_path = OUT_DIR / "SCN5A_internal_tag_design_package.html"
    html_path.write_text(build_report_html(), encoding="utf-8")

    order_rows = []
    for design in DESIGNS:
        for guide in design["guide_rows"]:
            order_rows.append({
                "Slot": design["slot"],
                "Design": design["design_label"],
                "Gene": design["gene"],
                "Design Type": design["design_type"],
                "Reference File": design["reference_file"],
                "Item Type": "gRNA",
                "Name": guide["name"],
                "Sequence To Order": guide["spacer"],
                "Spacer": guide["spacer"],
                "PAM": guide["pam"],
                "Strand": guide["strand"],
                "Length": len(guide["spacer"]),
                "Linked Guide": "",
                "Recommended": guide["recommended"],
                "Notes": guide["notes"],
            })
        for primer in design["primer_rows"]:
            order_rows.append({
                "Slot": design["slot"],
                "Design": design["design_label"],
                "Gene": design["gene"],
                "Design Type": design["design_type"],
                "Reference File": design["reference_file"],
                "Item Type": "Primer",
                "Name": primer["name"],
                "Sequence To Order": primer["sequence"],
                "Spacer": "",
                "PAM": "",
                "Strand": "",
                "Length": len(primer["sequence"]),
                "Linked Guide": "",
                "Recommended": "Yes",
                "Notes": "Validation primer",
            })
        order_rows.append({
            "Slot": design["slot"],
            "Design": design["design_label"],
            "Gene": design["gene"],
            "Design Type": design["design_type"],
            "Reference File": design["reference_file"],
            "Item Type": "HDR donor",
            "Name": design["donor_name"],
            "Sequence To Order": design["donor_sequence"],
            "Spacer": "",
            "PAM": "",
            "Strand": "recommended order strand",
            "Length": len(design["donor_sequence"]),
            "Linked Guide": design["linked_guide"],
            "Recommended": "Yes",
            "Notes": design["donor_notes"],
        })

    csv_headers = ["Slot", "Design", "Gene", "Design Type", "Reference File", "Item Type", "Name", "Sequence To Order", "Spacer", "PAM", "Strand", "Length", "Linked Guide", "Recommended", "Notes"]
    csv_path = OUT_DIR / "SCN5A_internal_tag_combined_order_preview.csv"
    with csv_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=csv_headers)
        writer.writeheader()
        writer.writerows(order_rows)

    crispr_rows = [{"Name": row["Name"], "Sequence": row["Sequence To Order"], "Scale": "25nm"} for row in order_rows if row["Item Type"] == "gRNA"]
    primer_rows = [{"Name": row["Name"], "Sequence": row["Sequence To Order"], "Scale": "25nm", "Purification": "STD"} for row in order_rows if row["Item Type"] == "Primer"]
    hdr_rows = [{"Name": row["Name"], "Sequence": row["Sequence To Order"], "Scale": "4nmU", "Modification": "None"} for row in order_rows if row["Item Type"] == "HDR donor"]

    write_xlsx(OUT_DIR / "SCN5A_internal_tag_template-paste-entry-crispr.xlsx", ["Name", "Sequence", "Scale"], crispr_rows)
    write_xlsx(OUT_DIR / "SCN5A_internal_tag_template-paste-entry.xlsx", ["Name", "Sequence", "Scale", "Purification"], primer_rows)
    write_xlsx(OUT_DIR / "SCN5A_internal_tag_template-paste-entry-hdr.xlsx", ["Name", "Sequence", "Scale", "Modification"], hdr_rows)

    print(html_path)
    print(csv_path)


if __name__ == "__main__":
    main()
