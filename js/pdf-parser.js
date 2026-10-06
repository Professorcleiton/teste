// ============================================================
//  PDF.js — configuração do worker
// ============================================================
pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// ============================================================
//  EXTRAÇÃO POR COORDENADAS (Y)
//  Muito mais robusta que agrupar por proximidade
// ============================================================
async function extrairLinhasEstruturadas(arquivo) {
    const buffer = await arquivo.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    const todasLinhas = [];

    for (let i = 1; i <= pdf.numPages; i++) {
        const pagina = await pdf.getPage(i);
        const conteudo = await pagina.getTextContent();

        // Coleta TODOS os itens com coordenadas
        const itens = conteudo.items
            .map(item => ({
                x: item.transform[4],
                y: item.transform[5],
                texto: item.str.trim()
            }))
            .filter(it => it.texto.length > 0);

        // Agrupa por Y (tolerância 3px)
        const TOLERANCIA = 3;
        const linhasAgrupadas = [];

        itens.forEach(item => {
            let linha = linhasAgrupadas.find(l =>
                Math.abs(l.y - item.y) < TOLERANCIA
            );
            if (linha) {
                linha.itens.push(item);
            } else {
                linhasAgrupadas.push({ y: item.y, itens: [item], pagina: i });
            }
        });

        // Ordena de cima para baixo
        linhasAgrupadas.sort((a, b) => b.y - a.y);

        linhasAgrupadas.forEach(l => {
            l.itens.sort((a, b) => a.x - b.x);
            todasLinhas.push({
                pagina: l.pagina,
                y: l.y,
                celulas: l.itens.map(it => it.texto),
                textoLinha: l.itens.map(it => it.texto).join(' | ')
            });
        });
    }

    return todasLinhas;
}

// ============================================================
//  EXTRAÇÃO DE ALUNOS — V6
//  Regra: só considera o PRIMEIRO bloco de relatório
//         (para no "Total de registros abaixo da Média")
// ============================================================
function extrairAlunosDasLinhas(linhas, trimestre) {
    const alunos = [];
    let turma = { serie: '', letra: '' };

    // Detecta turma (primeira ocorrência)
    for (const linha of linhas) {
        const m = linha.textoLinha.match(/Seriação:\s*(\d+)[ªº°]?\s*Ano.*Turma:\s*([A-Z])/i);
        if (m) {
            turma = { serie: m[1] + 'º ANO', letra: m[2].toUpperCase() };
            break;
        }
    }

    // Filtra linhas até encontrar o marcador de fim do primeiro relatório
    const linhasRelevantes = [];
    for (const linha of linhas) {
        const txt = linha.textoLinha;
        // Pula cabeçalhos
        if (/GOVERNO|SECRETARIA|CRUZEIRO|ANCHIETA|Curso:|RELATÓRIO|Disciplinas|Nro\.|Sistema Escola|DATA:|^T[123]/i.test(txt)) {
            continue;
        }
        // Para no fim do primeiro relatório
        if (/Total de registros abaixo/i.test(txt)) {
            break;
        }
        linhasRelevantes.push(linha);
    }

    // ---- Itera linha por linha buscando o número do aluno ----
    // Estratégia: o número aparece como UMA célula isolada "1", "2", ..., "34"
    for (let i = 0; i < linhasRelevantes.length; i++) {
        const linha = linhasRelevantes[i];
        const celulas = linha.celulas;

        // Procura célula com número isolado (1-40)
        let idxNum = -1;
        for (let j = 0; j < Math.min(celulas.length, 3); j++) {
            const c = celulas[j].trim();
            if (/^\d{1,2}$/.test(c)) {
                const n = parseInt(c);
                if (n >= 1 && n <= 99) { idxNum = j; break; }
            }
        }
        if (idxNum === -1) continue;

        const numero = parseInt(celulas[idxNum]);

        // Evita duplicata
        if (alunos.find(a => a.numero === numero)) continue;

        // ---- Extrai o nome ----
        let nome = '';

        // Caso 1: nome na MESMA linha (depois do número)
        for (let j = idxNum + 1; j < celulas.length; j++) {
            const c = celulas[j].trim();
            if (/^[A-ZÀ-Ú][A-ZÀ-Ú\s\.]{3,}$/.test(c)) {
                nome = c;
                break;
            }
            if (/^\d{1,2}[.,]\d$/.test(c) || c === '--') break;
        }

        // Caso 2: nome vem de 1-3 linhas ACIMA
        if (!nome) {
            const partes = [];
            for (let k = 1; k <= 3; k++) {
                const ant = linhasRelevantes[i - k];
                if (!ant) break;
                const txtAnt = ant.celulas.join(' ').trim();
                // Linha é só nome (sem números e sem notas)
                if (/^[A-ZÀ-Ú][A-ZÀ-Ú\s\.]{3,}$/.test(txtAnt)) {
                    partes.unshift(txtAnt);
                } else {
                    break;
                }
            }
            nome = partes.join(' ');
        }

        // Caso 3: junta com a próxima linha (sobrenome)
        if (nome && !nome.includes(' ')) {
            const prox = linhasRelevantes[i + 1];
            if (prox) {
                const txtProx = prox.celulas.join(' ').trim();
                if (/^[A-ZÀ-Ú][A-ZÀ-Ú\s\.]{3,}$/.test(txtProx)) {
                    nome = nome + ' ' + txtProx;
                }
            }
        }

        // ---- Extrai todas as notas ----
        const notas = [];
        for (let j = idxNum + 1; j < celulas.length; j++) {
            const c = celulas[j].trim();
            if (/^\d{1,2}[.,]\d$/.test(c)) {
                const n = parseFloat(c.replace(',', '.'));
                if (n >= 0 && n <= 10) notas.push(n);
            }
        }

        // Requer mínimo de notas
        if (notas.length < 5) continue;
        if (!nome || nome.length < 5) continue;

        const notasT = filtrarNotasTrimestre(notas, trimestre);

        alunos.push({
            numero,
            nome: nome.replace(/\s+/g, ' ').trim(),
            turma: { ...turma },
            notas,
            notasTrimestre: notasT,
            media: notasT.length > 0
                ? notasT.reduce((a, b) => a + b, 0) / notasT.length
                : 0,
            elegivel: notasT.length > 0 && notasT.every(n => n >= CONFIG.notaMinima)
        });
    }

    return alunos.sort((a, b) => a.numero - b.numero);
}

// ============================================================
//  Helpers
// ============================================================
function filtrarNotasTrimestre(notas, trimestre) {
    const offset = trimestre - 1;
    const filtradas = [];
    for (let i = offset; i < notas.length; i += 3) {
        filtradas.push(notas[i]);
    }
    return filtradas;
}

// ============================================================
//  Funções principais (chamadas pelo app.js)
// ============================================================
async function extrairTextoPDF(arquivo) {
    const linhas = await extrairLinhasEstruturadas(arquivo);
    return linhas.map(l => l.textoLinha).join('\n');
}

async function converterTextoEmAlunos(arquivo, trimestre) {
    const linhas = await extrairLinhasEstruturadas(arquivo);
    return extrairAlunosDasLinhas(linhas, trimestre);
}
