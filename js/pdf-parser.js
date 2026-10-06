// ============================================================
//  PDF.js — configuração do worker
// ============================================================
pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// ============================================================
//  MAPEAMENTO DE DISCIPLINAS
//  A ordem das disciplinas no cabeçalho do PDF é conhecida.
//  Cada disciplina tem 3 colunas: T1, T2, T3
// ============================================================
const DISCIPLINAS_ORDEM = [
    'ARTE',
    'CIENCIAS',
    'ED DIG COMP',
    'EDUCACAO FIS',
    'ENSINO RELIG',
    'GEOGRAFIA',
    'HISTORIA',
    'LINGUA INGLE',
    'LINGUA PORTU'
];

// ============================================================
//  EXTRAÇÃO POR COORDENADAS (X, Y)
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
//  DETECTA AS COLUNAS DE CADA DISCIPLINA × TRIMESTRE
//  Retorna array de { x, disciplina, trimestre }
// ============================================================
function detectarColunas(linhas) {
    // Encontra a linha de cabeçalho das disciplinas
    // (a que contém "ARTE", "CIENCIAS", etc. na mesma linha)
    let linhaDisciplinas = null;
    for (const l of linhas) {
        const texto = l.textoLinha;
        if (/ARTE/.test(texto) && /CIENCIAS/.test(texto) &&
            /LINGUA PORTU/.test(texto)) {
            linhaDisciplinas = l;
            break;
        }
    }

    if (!linhaDisciplinas) {
        console.error('❌ Linha de cabeçalho das disciplinas não encontrada');
        return [];
    }

    // Para cada célula da linha de disciplinas, associa o X à disciplina
    const colunasDisciplinas = [];
    linhaDisciplinas.celulasComX.forEach(celula => {
        const txt = celula.texto.toUpperCase().trim();
        // Verifica qual disciplina esse texto representa
        for (const disc of DISCIPLINAS_ORDEM) {
            // Compara removendo espaços e normalizando
            const norm1 = txt.replace(/\s+/g, ' ');
            const norm2 = disc.replace(/\s+/g, ' ');
            if (norm1 === norm2 ||
                norm1.startsWith(norm2.substring(0, 5)) ||
                norm2.startsWith(norm1.substring(0, 5))) {
                colunasDisciplinas.push({
                    x: celula.x,
                    disciplina: disc
                });
                break;
            }
        }
    });

    console.log(`📚 Disciplinas detectadas: ${colunasDisciplinas.length}`);
    colunasDisciplinas.forEach(c => console.log(`   X=${c.x.toFixed(1)} → ${c.disciplina}`));

    // Encontra a linha de cabeçalho T1 T2 T3
    let linhaT = null;
    for (const l of linhas) {
        const tCount = (l.textoLinha.match(/T[123]/g) || []).length;
        if (tCount >= 20) {
            linhaT = l;
            break;
        }
    }

    if (!linhaT) {
        console.error('❌ Linha T1/T2/T3 não encontrada');
        return [];
    }

    // Cada par (disciplina, trimestre) recebe um X aproximado
    // A linha T tem células "T1", "T2", "T3" repetidas 9 vezes (27 células)
    // Elas estão na mesma ordem das disciplinas
    const celulasT = linhaT.celulasComX.filter(c => /^T[123]$/.test(c.texto));

    console.log(`📐 ${celulasT.length} colunas de trimestre detectadas`);

    // Mapeia: cada célula T pertence à disciplina correspondente
    // (índice i = posição na lista de disciplinas)
    const colunas = [];
    celulasT.forEach((celT, idx) => {
        const idxDisciplina = Math.floor(idx / 3);
        if (idxDisciplina >= colunasDisciplinas.length) return;

        const disciplina = colunasDisciplinas[idxDisciplina].disciplina;
        const trimestre = parseInt(celT.texto[1]);

        colunas.push({
            x: celT.x,
            disciplina,
            trimestre
        });
    });

    return colunas;
}

// ============================================================
//  DETECÇÃO DE ALUNOS — usando coordenadas X reais
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

    // ---- Detecta as colunas ----
    const colunas = detectarColunas(linhas);
    if (colunas.length === 0) {
        console.error('❌ Não foi possível detectar as colunas');
        return [];
    }

    // Filtra linhas relevantes (para antes do "Total de registros")
    const linhasRelevantes = [];
    for (const linha of linhas) {
        const txt = linha.textoLinha;
        if (/GOVERNO|SECRETARIA|CRUZEIRO|ANCHIETA|Curso:|RELATÓRIO|Sistema Escola|DATA:|^T[123]|^ARTE\s*\|/i.test(txt)) continue;
        if (/Total de registros abaixo/i.test(txt)) break;
        linhasRelevantes.push(linha);
    }

    // Buffer de nomes
    let nomeBuffer = [];

    for (let i = 0; i < linhasRelevantes.length; i++) {
        const linha = linhasRelevantes[i];
        const celulas = linha.celulasComX;
        const textos = celulas.map(c => c.texto);

        // ---- Detecta linha puramente de nome ----
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

        // ---- Detecta número do aluno ----
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

        // ---- Extrai nome inline ----
        let nomeInline = '';
        for (let j = idxNum + 1; j < textos.length; j++) {
            const c = textos[j];
            if (/^[A-ZÀ-Ú][A-ZÀ-Ú\s\.]{2,}$/.test(c) && !/^\d/.test(c)) {
                nomeInline = c;
                break;
            }
            if (/^\d{1,2}[.,]\d$/.test(c) || c === '--') break;
        }

        // ---- Monta nome ----
        const partes = [...nomeBuffer];
        if (nomeInline) partes.push(nomeInline);
        let nome = partes.join(' ').replace(/\s+/g, ' ').trim();

        // Se só tem 1 palavra, olha a próxima linha
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
        //  ✅ MAPEAMENTO POR COORDENADAS X
        //  Para cada célula que é uma nota, encontra a coluna com X
        //  mais próximo. Cada coluna tem (disciplina, trimestre).
        // ============================================================
        const notasPorChave = {};  // chave = "DISCIPLINA_T1" etc

        // Considera apenas células APÓS o nome
        const celulasParaNotas = celulas.slice(idxNum + 1);

        for (const c of celulasParaNotas) {
            // Só considera células que são notas válidas
            if (!/^\d{1,2}[.,]\d$/.test(c.texto)) continue;

            const valorNota = parseFloat(c.texto.replace(',', '.'));
            if (isNaN(valorNota) || valorNota < 0 || valorNota > 10) continue;

            // Encontra a coluna (disciplina, trimestre) com X mais próximo
            let melhorColuna = null;
            let menorDist = 20;  // tolerância de 20px

            for (const col of colunas) {
                const dist = Math.abs(col.x - c.x);
                if (dist < menorDist) {
                    menorDist = dist;
                    melhorColuna = col;
                }
            }

            if (melhorColuna) {
                const chave = `${melhorColuna.disciplina}_T${melhorColuna.trimestre}`;
                // Se já existe, mantém o primeiro (mais próximo em X)
                if (!notasPorChave[chave]) {
                    notasPorChave[chave] = valorNota;
                }
            }
        }

        // Filtra notas do trimestre escolhido
        const notasT = [];
        for (const disc of DISCIPLINAS_ORDEM) {
            const chave = `${disc}_T${trimestre}`;
            if (notasPorChave[chave] !== undefined) {
                notasT.push(notasPorChave[chave]);
            }
        }

        // Se não achou NENHUMA nota, pula
        if (notasT.length === 0) { nomeBuffer = []; continue; }

        // ⚠️ REGRA: se o aluno tem menos notas do que disciplinas
        // que aparecem com nota no PDF, considerar NÃO elegível
        // (isso cobre casos onde notas faltam)
        const totalDisciplinasComNotaNoPdf = DISCIPLINAS_ORDEM.filter(disc => {
            // Verifica se o aluno tem QUALQUER nota dessa disciplina em algum trimestre
            return [1, 2, 3].some(t => notasPorChave[`${disc}_T${t}`] !== undefined);
        }).length;

        const elegivel = notasT.length === totalDisciplinasComNotaNoPdf &&
                        notasT.every(n => n >= CONFIG.notaMinima);

        alunos.push({
            numero,
            nome,
            turma: { ...turma },
            notasPorChave,
            notasTrimestre: notasT,
            media: notasT.length > 0
                ? notasT.reduce((a, b) => a + b, 0) / notasT.length
                : 0,
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
