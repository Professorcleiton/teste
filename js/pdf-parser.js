// ============================================================
//  PDF.js — configuração do worker
// ============================================================
pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// ============================================================
//  EXTRAÇÃO POR COORDENADAS (Y)
// ============================================================
async function extrairLinhasEstruturadas(arquivo) {
    const buffer = await arquivo.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    const todasLinhas = [];

    for (let i = 1; i <= pdf.numPages; i++) {
        const pagina = await pdf.getPage(i);
        const conteudo = await pagina.getTextContent();

        const itens = conteudo.items
            .map(item => ({
                x: item.transform[4],
                y: item.transform[5],
                texto: item.str.trim()
            }))
            .filter(it => it.texto.length > 0);

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
//  DETECÇÃO DE ALUNOS — V7 (definitiva)
//  Reconhece: "N | SOBRENOME | notas..." ou "N | nome | notas..."
// ============================================================
function extrairAlunosDasLinhas(linhas, trimestre) {
    const alunos = [];
    let turma = { serie: '', letra: '' };

    // Detecta turma
    for (const linha of linhas) {
        const m = linha.textoLinha.match(/Seriação:\s*(\d+)[ªº°]?\s*Ano.*Turma:\s*([A-Z])/i);
        if (m) {
            turma = { serie: m[1] + 'º ANO', letra: m[2].toUpperCase() };
            break;
        }
    }

    // Filtra linhas — remove cabeçalhos e para no primeiro "Total de registros"
    const linhasRelevantes = [];
    for (const linha of linhas) {
        const txt = linha.textoLinha;
        if (/GOVERNO|SECRETARIA|CRUZEIRO|ANCHIETA|Curso:|RELATÓRIO|Sistema Escola|DATA:|^T[123]/i.test(txt)) continue;
        if (/^Disciplinas|^Nro\.|^Nome$/i.test(txt)) continue;
        if (/^ARTE\s*\|/i.test(txt) && /CIENCIAS/i.test(txt)) continue;  // linha de cabeçalho de disciplinas
        if (/Total de registros abaixo/i.test(txt)) break;
        linhasRelevantes.push(linha);
    }

    // Buffer que acumula partes de nomes quebrados
    let nomeBuffer = [];

    for (let i = 0; i < linhasRelevantes.length; i++) {
        const linha = linhasRelevantes[i];
        const celulas = linha.celulas.map(c => c.trim()).filter(c => c.length > 0);

        if (celulas.length === 0) continue;

        // ---- Detecta linha puramente de nome (sem números) ----
        const textoLimpo = celulas.join(' ').trim();
        const temNumero = celulas.some(c => /^\d{1,2}$/.test(c));
        const ehSóNome = !temNumero &&
                        /^[A-ZÀ-Ú][A-ZÀ-Ú\s\.]{3,}$/.test(textoLimpo) &&
                        textoLimpo.length >= 8;

        if (ehSóNome) {
            nomeBuffer.push(textoLimpo);
            if (nomeBuffer.length > 3) nomeBuffer.shift();
            continue;
        }

        // ---- Detecta linha com NÚMERO do aluno ----
        // Formato: "N | [nome/sobrenome] | notas..."
        let idxNum = -1;
        for (let j = 0; j < Math.min(celulas.length, 2); j++) {
            if (/^\d{1,2}$/.test(celulas[j])) {
                const n = parseInt(celulas[j]);
                if (n >= 1 && n <= 99) { idxNum = j; break; }
            }
        }
        if (idxNum === -1) {
            nomeBuffer = [];
            continue;
        }

        const numero = parseInt(celulas[idxNum]);
        if (alunos.find(a => a.numero === numero)) {
            nomeBuffer = [];
            continue;
        }

        // ---- Extrai nome inline (célula após o número) ----
        let nomeInline = '';
        let idxPrimeiraNota = -1;

        for (let j = idxNum + 1; j < celulas.length; j++) {
            const c = celulas[j];
            if (/^[A-ZÀ-Ú][A-ZÀ-Ú\s\.]{2,}$/.test(c) && !nomeInline) {
                nomeInline = c;
            }
            if (/^\d{1,2}[.,]\d$/.test(c)) {
                idxPrimeiraNota = j;
                break;
            }
        }

        // ---- Monta o nome completo ----
        // Ordem: [nomeBuffer] + [nomeInline]
        const partes = [...nomeBuffer];
        if (nomeInline) partes.push(nomeInline);

        // Se ainda tem só 1 palavra, olha a próxima linha
        let nome = partes.join(' ').replace(/\s+/g, ' ').trim();

        if (nome.split(' ').length < 2) {
            const prox = linhasRelevantes[i + 1];
            if (prox) {
                const proxCelulas = prox.celulas.map(c => c.trim()).filter(c => c.length > 0);
                const proxTexto = proxCelulas.join(' ').trim();
                const proxSemNumero = !proxCelulas.some(c => /^\d{1,2}$/.test(c));
                if (proxSemNumero && /^[A-ZÀ-Ú][A-ZÀ-Ú\s\.]{3,}$/.test(proxTexto)) {
                    nome = (nome + ' ' + proxTexto).trim();
                }
            }
        }

        if (!nome || nome.length < 5) {
            nomeBuffer = [];
            continue;
        }

        // ---- Extrai notas ----
        const inicioNotas = idxPrimeiraNota !== -1 ? idxPrimeiraNota : idxNum + 1;
        const notas = [];
        for (let j = inicioNotas; j < celulas.length; j++) {
            const c = celulas[j];
            if (/^\d{1,2}[.,]\d$/.test(c)) {
                const n = parseFloat(c.replace(',', '.'));
                if (n >= 0 && n <= 10) notas.push(n);
            }
        }

        if (notas.length < 5) {
            nomeBuffer = [];
            continue;
        }

        const notasT = filtrarNotasTrimestre(notas, trimestre);

        alunos.push({
            numero,
            nome,
            turma: { ...turma },
            notas,
            notasTrimestre: notasT,
            media: notasT.length > 0
                ? notasT.reduce((a, b) => a + b, 0) / notasT.length
                : 0,
            elegivel: notasT.length > 0 && notasT.every(n => n >= CONFIG.notaMinima)
        });

        nomeBuffer = [];
    }

    return alunos.sort((a, b) => a.numero - b.numero);
}

// ============================================================
//  FILTRO DE TRIMESTRE — detecção automática de padrão
// ============================================================
function filtrarNotasTrimestre(notas, trimestre) {
    // O parser remove os "--" e mantém apenas notas válidas.
    // Se o PDF tem N disciplinas × 2 trimestres, o padrão é:
    //   [D1-T1, D1-T2, D2-T1, D2-T2, D3-T1, D3-T2, ...]
    // Se tem N × 3 trimestres:
    //   [D1-T1, D1-T2, D1-T3, D2-T1, ...]
    //
    // Total de notas detectadas:
    //   16 → 8 disciplinas × 2 trimestres
    //   24 → 8 disciplinas × 3 trimestres
    //   27 → 9 disciplinas × 3 trimestres
    //   18 → 9 disciplinas × 2 trimestres
    const total = notas.length;
    let porDisciplina = 2;  // padrão para seu PDF

    if (total === 16 || total === 18 || total === 20) porDisciplina = 2;
    else if (total === 24 || total === 27) porDisciplina = 3;
    else if (total % 3 === 0) porDisciplina = 3;

    const offset = (trimestre - 1) % porDisciplina;
    const filtradas = [];
    for (let i = offset; i < notas.length; i += porDisciplina) {
        filtradas.push(notas[i]);
    }
    return filtradas;
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
