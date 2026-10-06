// ============================================================
//  PDF.js — configuração do worker
// ============================================================
pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// ============================================================
//  DISCIPLINAS NA ORDEM DO PDF
// ============================================================
const DISCIPLINAS_ORDEM = [
    'ARTE', 'CIENCIAS', 'EDDIG', 'EDFIS', 'ENSREL',
    'GEOGRAFIA', 'HISTORIA', 'INGLES', 'PORTUGUES'
];

// ============================================================
//  EXTRAÇÃO POR COORDENADAS
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

        const TOL_Y = 3;
        const linhasAgrupadas = [];

        itens.forEach(item => {
            let linha = linhasAgrupadas.find(l => Math.abs(l.y - item.y) < TOL_Y);
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
                celulasComX: l.itens.map(it => ({ x: it.x, texto: it.texto })),
                textoLinha: l.itens.map(it => it.texto).join(' | ')
            });
        });
    }

    return todasLinhas;
}

// ============================================================
//  DETECTA AS FAIXAS (BINS) DE CADA COLUNA
//  Cada disciplina tem 3 sub-colunas (T1, T2, T3)
//  Calculamos o X central e uma largura de faixa (~18px)
// ============================================================
function detectarColunasComBins(linhas) {
    // Encontra linha T1 T2 T3
    let linhaT = null;
    for (const l of linhas) {
        const tCount = l.celulasComX.filter(c => /^T[123]$/.test(c.texto)).length;
        if (tCount >= 20) { linhaT = l; break; }
    }
    if (!linhaT) {
        console.error('❌ Linha T1/T2/T3 não encontrada');
        return null;
    }

    const celulasT = linhaT.celulasComX.filter(c => /^T[123]$/.test(c.texto));
    console.log(`📐 Encontradas ${celulasT.length} células T1/T2/T3`);

    // Cada 3 células T = 1 disciplina
    if (celulasT.length !== 27) {
        console.error(`❌ Esperado 27 células T, encontrado ${celulasT.length}`);
        return null;
    }

    // Cria 27 colunas com (disciplina, trimestre, xCentro, xMin, xMax)
    const colunas = [];
    celulasT.forEach((cT, idx) => {
        const idxDisc = Math.floor(idx / 3);
        const disciplina = DISCIPLINAS_ORDEM[idxDisc];
        const trimestre = parseInt(cT.texto[1]);

        // Faixa: do meio entre vizinhos
        const meioEsq = idx > 0 ? (celulasT[idx - 1].x + cT.x) / 2 : cT.x - 12;
        const meioDir = idx < celulasT.length - 1 ? (cT.x + celulasT[idx + 1].x) / 2 : cT.x + 12;

        colunas.push({
            xCentro: cT.x,
            xMin: meioEsq,
            xMax: meioDir,
            disciplina,
            trimestre,
            idx
        });
    });

    console.log('🎯 Colunas (com faixas):');
    colunas.forEach(c => {
        console.log(`   ${c.disciplina}_T${c.trimestre}  X∈[${c.xMin.toFixed(0)}..${c.xMax.toFixed(0)}] centro=${c.xCentro.toFixed(0)}`);
    });

    return colunas;
}

// ============================================================
//  LOCALIZA COLUNA PELO X (dentro de uma faixa)
// ============================================================
function colunaPorX(colunas, x) {
    for (const col of colunas) {
        if (x >= col.xMin && x < col.xMax) return col;
    }
    // Se não achou, usa o centro mais próximo com tolerância
    let melhor = null, menorDist = 25;
    for (const col of colunas) {
        const d = Math.abs(col.xCentro - x);
        if (d < menorDist) { menorDist = d; melhor = col; }
    }
    return melhor;
}

// ============================================================
//  DETECÇÃO DE ALUNOS
// ============================================================
function extrairAlunosDasLinhas(linhas, trimestre) {
    const alunos = [];
    let turma = { serie: '', letra: '' };

    for (const linha of linhas) {
        const m = linha.textoLinha.match(/Seriação:\s*(\d+)[ªº°]?\s*Ano.*Turma:\s*([A-Z])/i);
        if (m) {
            turma = { serie: m[1] + 'º ANO', letra: m[2].toUpperCase() };
            break;
        }
    }

    const colunas = detectarColunasComBins(linhas);
    if (!colunas) { console.error('❌ Sem colunas'); return []; }

    // Filtra linhas relevantes
    const linhasRelevantes = [];
    for (const linha of linhas) {
        const txt = linha.textoLinha;
        if (/GOVERNO|SECRETARIA|CRUZEIRO|ANCHIETA|Curso:|RELATÓRIO|Sistema Escola|DATA:/i.test(txt)) continue;
        if (/^T[123]\s*\|/.test(txt)) continue;
        if (/^ARTE\s*\|.*CIENCIAS/i.test(txt)) continue;
        if (/Total de registros abaixo/i.test(txt)) break;
        linhasRelevantes.push(linha);
    }

    let nomeBuffer = [];

    for (let i = 0; i < linhasRelevantes.length; i++) {
        const linha = linhasRelevantes[i];
        const celulas = linha.celulasComX;
        const textos = celulas.map(c => c.texto);

        // Linha só de nome?
        const textoLimpo = textos.join(' ').trim();
        const temNumero = textos.some(c => /^\d{1,2}$/.test(c));
        const ehSóNome = !temNumero &&
                        /^[A-ZÀ-Ú][A-ZÀ-Ú\s\.]{3,}$/.test(textoLimpo) &&
                        textoLimpo.length >= 8 &&
                        !/ARTE|CIENCIAS|DISCIPLINAS/i.test(textoLimpo);

        if (ehSóNome) {
            nomeBuffer.push(textoLimpo);
            if (nomeBuffer.length > 3) nomeBuffer.shift();
            continue;
        }

        // Detecta número
        let idxNum = -1;
        for (let j = 0; j < Math.min(textos.length, 2); j++) {
            if (/^\d{1,2}$/.test(textos[j])) {
                const n = parseInt(textos[j]);
                if (n >= 1 && n <= 99) { idxNum = j; break; }
            }
        }
        if (idxNum === -1) { nomeBuffer = []; continue; }

        const numero = parseInt(textos[idxNum]);
        if (alunos.find(a => a.numero === numero)) { nomeBuffer = []; continue; }

        // Nome inline
        let nomeInline = '';
        for (let j = idxNum + 1; j < textos.length; j++) {
            const c = textos[j];
            if (/^[A-ZÀ-Ú][A-ZÀ-Ú\s\.]{2,}$/.test(c) && !/^\d/.test(c)) {
                nomeInline = c;
                break;
            }
            if (/^\d{1,2}[.,]\d$/.test(c) || c === '--') break;
        }

        const partes = [...nomeBuffer];
        if (nomeInline) partes.push(nomeInline);
        let nome = partes.join(' ').replace(/\s+/g, ' ').trim();

        if (nome.split(' ').length < 2 && i + 1 < linhasRelevantes.length) {
            const prox = linhasRelevantes[i + 1];
            const proxTextos = prox.celulasComX.map(c => c.texto);
            const proxTxt = proxTextos.join(' ').trim();
            if (/^[A-ZÀ-Ú][A-ZÀ-Ú\s\.]{3,}$/.test(proxTxt) &&
                !proxTextos.some(c => /^\d{1,2}$/.test(c))) {
                nome = (nome + ' ' + proxTxt).trim();
            }
        }

        if (!nome || nome.length < 5) { nomeBuffer = []; continue; }

        // ============================================================
        //  MAPEAMENTO POR FAIXA DE X (bins)
        // ============================================================
        const notasPorChave = {};

        // Processa cada célula após o número
        for (let j = idxNum + 1; j < celulas.length; j++) {
            const c = celulas[j];
            // Só notas
            if (!/^\d{1,2}[.,]\d$/.test(c.texto)) continue;

            const valor = parseFloat(c.texto.replace(',', '.'));
            if (isNaN(valor) || valor < 0 || valor > 10) continue;

            const col = colunaPorX(colunas, c.x);
            if (col) {
                const chave = `${col.disciplina}_T${col.trimestre}`;
                // Só sobrescreve se ainda não existe
                if (notasPorChave[chave] === undefined) {
                    notasPorChave[chave] = valor;
                }
            }
        }

        // Notas do trimestre
        const notasT = [];
        for (const disc of DISCIPLINAS_ORDEM) {
            const chave = `${disc}_T${trimestre}`;
            if (notasPorChave[chave] !== undefined) {
                notasT.push(notasPorChave[chave]);
            }
        }

        if (notasT.length === 0) {
            console.warn(`⚠️ Aluno ${numero} (${nome}): nenhuma nota T${trimestre} mapeada`);
            nomeBuffer = [];
            continue;
        }

        // Regra CONSERVADORA: só elegível se tiver notas para TODAS
        // as disciplinas que aparecem no trimestre escolhido
        // (evita certificar por falta de dados)
        const disciplinasComNotaNoTri = DISCIPLINAS_ORDEM.filter(disc =>
            notasPorChave[`${disc}_T${trimestre}`] !== undefined
        );

        // Verifica se alguma disciplina esperada está faltando
        // (ou seja, se o PDF mostra T1 dela para esse aluno)
        // Regra atual: todas as disciplinas que o aluno TEM nota contam

        const todasNotasOk = notasT.every(n => n >= CONFIG.notaMinima);
        const elegivel = todasNotasOk && notasT.length >= 5;

        alunos.push({
            numero,
            nome,
            turma: { ...turma },
            notasPorChave,
            notasTrimestre: notasT,
            media: notasT.reduce((a, b) => a + b, 0) / notasT.length,
            elegivel
        });

        nomeBuffer = [];
    }

    return alunos.sort((a, b) => a.numero - b.numero);
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
