// ============================================================
//  PDF.js — configuração do worker
// ============================================================
pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// ============================================================
//  EXTRAÇÃO POR COORDENADAS — versão robusta
// ============================================================
async function extrairLinhasEstruturadas(arquivo) {
    const buffer = await arquivo.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    const todasLinhas = [];

    for (let i = 1; i <= pdf.numPages; i++) {
        const pagina = await pdf.getPage(i);
        const conteudo = await pagina.getTextContent();

        // Agrupa itens por Y (linha) com tolerância maior
        const porLinha = {};

        conteudo.items.forEach(item => {
            const x = item.transform[4];
            const y = Math.round(item.transform[5] / 5) * 5;  // tolerância de 5px

            if (!porLinha[y]) porLinha[y] = [];
            porLinha[y].push({
                x: x,
                texto: item.str,
                largura: item.width || 0
            });
        });

        const ys = Object.keys(porLinha).map(Number).sort((a, b) => b - a);

        ys.forEach(y => {
            const celulas = porLinha[y]
                .sort((a, b) => a.x - b.x)
                .filter(c => c.texto.trim().length > 0);

            if (celulas.length > 0) {
                todasLinhas.push({
                    pagina: i,
                    y: y,
                    celulas: celulas,
                    textoLinha: celulas.map(c => c.texto).join(' | ')
                });
            }
        });
    }
    return todasLinhas;
}

// ============================================================
//  DETECÇÃO DE ALUNOS — versão multi-formato
// ============================================================
function extrairAlunosDasLinhas(linhas, trimestre) {
    const alunos = [];
    let turmaAtual = { serie: "", letra: "" };

    // ---- Detecta turma ----
    for (const linha of linhas) {
        const txt = linha.celulas.map(c => c.texto).join(' ');
        const m = txt.match(/Seriação:\s*(\d+)[ªº°]?\s*Ano.*Turma:\s*([A-Z])/i);
        if (m) {
            turmaAtual = {
                serie: m[1] + 'º ANO',
                letra: m[2].toUpperCase()
            };
            break;
        }
    }

    // ---- Junta todo o conteúdo em um único texto para processar ----
    const textoCompleto = linhas.map(l => l.textoLinha).join('\n');

    // ---- Estratégia 1: nome + número + notas na MESMA linha ----
    // Padrão: "  N   NOME COMPLETO EM MAIÚSCULAS   nota  nota  --  ..."
    const regexLinhaUnica = /(?:^|\n)\s*(\d{1,3})\s+([A-ZÀ-Ú][A-ZÀ-Ú\s\.]{3,}?)\s+((?:(?:\d{1,2}[.,]\d|--)\s*){5,})/g;

    let match;
    while ((match = regexLinhaUnica.exec(textoCompleto)) !== null) {
        const numero = parseInt(match[1]);
        const nome = match[2].replace(/\s+/g, ' ').trim();
        const notasTexto = match[3];

        const notas = [...notasTexto.matchAll(/\d{1,2}[.,]\d/g)]
            .map(m => parseFloat(m[0].replace(',', '.')))
            .filter(n => n >= 0 && n <= 10);

        if (notas.length >= 5 && nome.length >= 5) {
            alunos.push({
                numero, nome, turma: { ...turmaAtual }, notas,
                media: notas.reduce((a, b) => a + b, 0) / notas.length,
                elegivel: notas.every(n => n >= CONFIG.notaMinima)
            });
        }
    }

    // ---- Estratégia 2: nome QUEBRADO em várias linhas ----
    // O padrão é:
    //   NOME PARTE 1
    //   N   nota  nota  --
    //   SOBRENOME PARTE 2
    const linhasArr = linhas.map(l => l.textoLinha);

    for (let i = 0; i < linhasArr.length - 2; i++) {
        // Linha i: começa com nome em maiúsculas (sem número)
        const linhaNome1 = linhasArr[i];
        if (!/^[A-ZÀ-Ú][A-ZÀ-Ú\s]+\s*$/.test(linhaNome1)) continue;
        if (linhaNome1.includes('|')) continue;  // já foi tratada

        // Linha i+1: número + notas
        const linhaNum = linhasArr[i + 1];
        const matchNum = linhaNum.match(/(\d{1,3})\s+((?:(?:\d{1,2}[.,]\d|--)\s*){5,})/);
        if (!matchNum) continue;

        const numero = parseInt(matchNum[1]);
        const notas = [...matchNum[2].matchAll(/\d{1,2}[.,]\d/g)]
            .map(m => parseFloat(m[0].replace(',', '.')));

        if (notas.length < 5) continue;

        // Linha i+2: sobrenome
        const linhaNome2 = linhasArr[i + 2];
        if (!/^[A-ZÀ-Ú][A-ZÀ-Ú\s]+\s*$/.test(linhaNome2)) continue;

        const nome = (linhaNome1 + ' ' + linhaNome2).replace(/\s+/g, ' ').trim();

        // Evita duplicatas
        if (alunos.find(a => a.numero === numero)) continue;

        alunos.push({
            numero, nome, turma: { ...turmaAtual }, notas,
            media: notas.reduce((a, b) => a + b, 0) / notas.length,
            elegivel: notas.every(n => n >= CONFIG.notaMinima)
        });
    }

    // ---- Ordena por número do aluno ----
    alunos.sort((a, b) => a.numero - b.numero);

    return alunos;
}

// ============================================================
//  Funções principais
// ============================================================
async function extrairTextoPDF(arquivo) {
    const linhas = await extrairLinhasEstruturadas(arquivo);
    return linhas.map(l => l.textoLinha).join('\n');
}

async function converterTextoEmAlunos(arquivo, trimestre) {
    const linhas = await extrairLinhasEstruturadas(arquivo);
    return extrairAlunosDasLinhas(linhas, trimestre);
}
