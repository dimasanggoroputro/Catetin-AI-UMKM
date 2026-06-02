import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

function normalizeUnit(unit) {
  if (!unit) return null;
  let u = unit.trim().toLowerCase().replace(/\./g, ""); // e.g. "kg." -> "kg"
  const mappings = {
    kg: "kg",
    kilogram: "kg",
    kilograms: "kg",
    pcs: "pcs",
    pc: "pcs",
    bks: "bungkus",
    bungkus: "bungkus",
    bgk: "bungkus",
    g: "gram",
    gr: "gram",
    gram: "gram",
    grm: "gram",
    liter: "liter",
    ltr: "liter",
    l: "liter",
    ml: "ml",
    mili: "ml",
    biji: "biji",
    bj: "biji",
    pack: "pack",
    pck: "pack",
    botol: "botol",
    btl: "botol",
    dus: "dus",
    box: "dus",
    sachet: "sachet",
    sch: "sachet",
    porsi: "porsi",
    prs: "porsi",
    gelas: "gelas",
    gls: "gelas",
  };
  return mappings[u] || u;
}

export async function POST(req) {
  console.log("=== START AI RECEIPT SCANNER API ===");
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error(
        "API Error: GEMINI_API_KEY is not defined in env variables.",
      );
      return NextResponse.json(
        {
          error: "GEMINI_API_KEY_MISSING",
          message: "API Key Gemini belum diatur di .env.local",
        },
        { status: 400 },
      );
    }

    const body = await req.json();
    const { image, mimeType } = body;

    if (!image || !mimeType) {
      console.error("API Error: Missing image or mimeType in request body.");
      return NextResponse.json(
        {
          error: "INVALID_REQUEST",
          message: "Gambar atau tipe MIME tidak boleh kosong",
        },
        { status: 400 },
      );
    }

    console.log(
      `Received image. MIME type: ${mimeType}. Size of payload: ${image.length} chars.`,
    );

    // Clean base64 string safely by splitting at ";base64,"
    const base64Data = image.includes(";base64,")
      ? image.split(";base64,").pop()
      : image;
    console.log("Cleaned base64 payload prefix successfully.");

    const systemInstruction = `
Kamu adalah modul OCR & parsing dokumen keuangan pintar khusus untuk UMKM Indonesia.
Tugas kamu adalah menganalisa foto struk belanja, faktur, nota, tagihan, catatan buku kas, catatan penjualan/pembelian tulisan tangan, atau daftar transaksi informal secara presisi.

PANDUAN PARSING & EKSTRAKSI SEMANTIK:
1. Analisa gambar yang diberikan. Gambar bisa berupa struk belanja tercetak, nota pembelian, faktur, invoice, buku kas tulisan tangan, catatan coretan transaksi di kertas, atau daftar pemasukan/pengeluaran informal.
2. Jangan langsung mengembalikan 'success: false' hanya karena gambar tidak terlihat seperti struk cetak resmi. Selama ada teks berisi catatan transaksi keuangan (pemasukan atau pengeluaran) yang bisa dibaca dan diekstrak, kembalikan 'success: true'.
3. Identifikasi jenis dokumen keuangan yang dideteksi (misal: "Struk Belanja", "Nota Pembelian", "Invoice", "Buku Kas Tulisan Tangan", "Catatan Transaksi", "Coretan Manual", atau "Informal Text").
4. Identifikasi merchant/nama toko (jika ada). Jika berupa catatan manual, nama toko mungkin tidak ada, kembalikan null atau kosongkan.
5. Lakukan Ekstraksi Transaksi Semantik:
   - Ekstrak baris transaksi baik dari format tabel (struk/invoice) maupun dari kalimat bebas informal (contoh: "jual mobil Honda 5 unit 500jt", "beli gas lpg 3 biji 66rb", "pemasukan katering bu endang 2.5jt", "bayar kontrakan 12 juta").
   - Untuk setiap transaksi yang diekstrak, tentukan:
     * 'item': Nama barang/transaksi bersih dan rapi (Title Case). Contoh: "Mobil Honda", "Gas LPG", "Katering Bu Endang", "Kontrakan".
     * 'amount': Nominal total transaksi bersih (qty * harga satuan) dalam Rupiah tanpa simbol Rp atau titik/koma ribuan. Contoh: 500000000, 66000, 2500000, 12000000.
     * 'qty': Jumlah unit/kuantitas (angka). Jika tidak disebutkan secara eksplisit, gunakan default 1.
     * 'unit': Satuan unit yang terdeteksi (e.g. "pcs", "kg", "unit", "bungkus", "keranjang", "box", "liter"). Jika tidak ada, gunakan null.
     * 'type': Tipe transaksi ("income" jika pemasukan/penjualan, "expense" jika pengeluaran/pembelian). Lakukan analisa semantik (kata seperti "jual", "terima", "masuk", "omset", "pemasukan" menandakan "income", sedangkan kata seperti "beli", "bayar", "belanja", "pengeluaran", "ongkos" menandakan "expense").
     * 'category': Kategorikan transaksi ke salah satu dari kategori berikut:
       - "food": Makanan, minuman, katering, bahan dapur, kopi, makan siang, cemilan.
       - "shopping": Belanja perlengkapan toko, alat tulis, kendaraan operasional, sabun cuci, barang operasional harian.
       - "bills": Tagihan listrik, air, internet wifi, pulsa, token.
       - "salary": Gaji karyawan, upah harian.
       - "rent": Sewa toko, sewa lapak bulanan/tahunan, sewa kontrakan.
       - "other": Item lain yang tidak masuk kategori di atas.
     * 'confidence': Estimasi tingkat kejelasan/keyakinan ekstraksi item ini (nilai decimal dari 0.0 sampai 1.0). Gunakan nilai yang lebih rendah (misal 0.5 - 0.7) untuk tulisan tangan yang buram atau coretan yang kurang terbaca, dan nilai tinggi (0.9 - 1.0) untuk teks cetak yang jelas.
6. Jika tulisan tangan kurang jelas, lakukan best-effort extraction menggunakan konteks kalimat sekitarnya. Jangan langsung gagal kecuali gambar benar-benar kosong, buram total, atau tidak mengandung informasi transaksi sekali pun.
`;

    console.log("Initializing Google Generative AI...");
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: systemInstruction, // Fix: Ensure system instructions are passed here
    });

    const prompt = `
Analisa dokumen keuangan atau catatan transaksi ini dan kembalikan data dalam bentuk JSON terstruktur sesuai schema.
Buku kas tulisan tangan, catatan coretan manual, daftar transaksi, atau kalimat informal semuanya valid.
Pastikan melakukan ekstraksi semantik yang akurat untuk setiap baris transaksi.
Hanya kembalikan success=false jika gambar benar-benar kosong, bukan dokumen/catatan keuangan, atau tidak ada data transaksi yang dapat dikenali sama sekali.
`;

    console.log("Sending payload to Gemini 2.5 Flash Vision...");
    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                data: base64Data,
                mimeType: mimeType,
              },
            },
            { text: prompt },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
              description:
                "True jika berhasil mengekstrak minimal satu transaksi keuangan dari dokumen/catatan. False jika tidak ada transaksi yang dapat dikenali sama sekali.",
            },
            merchantName: {
              type: "string",
              description:
                "Nama toko/merchant (e.g. 'Indomaret'). Kosongkan atau null jika tidak terdeteksi.",
            },
            documentType: {
              type: "string",
              description:
                "Jenis dokumen keuangan yang dideteksi (e.g. 'Struk Belanja', 'Invoice', 'Buku Kas Tulisan Tangan', 'Catatan Transaksi').",
            },
            items: {
              type: "array",
              description: "Daftar item transaksi yang berhasil diekstrak.",
              items: {
                type: "object",
                properties: {
                  type: {
                    type: "string",
                    enum: ["income", "expense"],
                    description:
                      "Tipe transaksi: 'income' (pemasukan/penjualan) atau 'expense' (pengeluaran/pembelian).",
                  },
                  item: {
                    type: "string",
                    description:
                      "Nama barang/transaksi bersih (Title Case). E.g. 'Gula Pasir', 'Beli Kopi'.",
                  },
                  qty: {
                    type: "number",
                    description: "Jumlah unit barang (default 1 jika tidak ada).",
                  },
                  unit: {
                    type: "string",
                    description:
                      "Satuan unit (e.g. 'pcs', 'kg', 'unit', 'bungkus') atau null jika tidak ada.",
                  },
                  amount: {
                    type: "number",
                    description:
                      "Total nominal transaksi untuk item ini (bukan harga satuan).",
                  },
                  category: {
                    type: "string",
                    enum: [
                      "food",
                      "shopping",
                      "bills",
                      "salary",
                      "rent",
                      "other",
                    ],
                    description: "Kategori klasifikasi transaksi.",
                  },
                  confidence: {
                    type: "number",
                    description:
                      "Tingkat kejelasan/confidence score (0.0 sampai 1.0).",
                  },
                },
                required: ["type", "item", "qty", "amount", "category"],
              },
            },
          },
          required: ["success", "items"],
        },
      },
    });

    const responseText = result.response.text();
    console.log("Raw response from Gemini Vision:", responseText);

    // Clean JSON formatting if Gemini returned markdown block
    let cleanText = responseText.trim();
    if (cleanText.startsWith("```")) {
      cleanText = cleanText.replace(/^```(?:json)?\n?/i, "");
    }
    if (cleanText.endsWith("```")) {
      cleanText = cleanText.slice(0, -3).trim();
    }

    let parsedData;
    try {
      parsedData = JSON.parse(cleanText);
    } catch (parseErr) {
      console.error(
        "Failed to parse JSON response from Gemini. Raw response was:",
        responseText,
        parseErr,
      );
      return NextResponse.json(
        {
          error: "INVALID_JSON_RESPONSE",
          message:
            "AI tidak mengembalikan format data yang valid. Silakan coba kembali dengan foto struk yang lebih jelas.",
        },
        { status: 422 },
      );
    }

    if (parsedData.items && Array.isArray(parsedData.items)) {
      parsedData.items = parsedData.items.map((item) => ({
        ...item,
        unit: normalizeUnit(item.unit),
      }));
    }

    console.log("=== END API - SUCCESS ===");
    return NextResponse.json(parsedData);
  } catch (error) {
    console.error("CRITICAL API Scan Receipt Error:", error);

    const msg = error.message || "";
    const isRateLimit =
      msg.includes("429") ||
      msg.toLowerCase().includes("quota exceeded") ||
      msg.toLowerCase().includes("too many requests");

    if (isRateLimit) {
      console.warn("API Rate limit hit on Gemini Vision.");
      return NextResponse.json(
        {
          error: "RATE_LIMIT_EXCEEDED",
          message:
            "Kuota harian Gemini AI sudah habis. Silakan coba kembali nanti.",
        },
        { status: 429 },
      );
    }

    return NextResponse.json(
      {
        error: "API_ERROR",
        message:
          "Gagal memproses dokumen. Coba ambil foto yang lebih jelas dengan pencahayaan yang cukup.",
      },
      { status: 500 },
    );
  }
}
