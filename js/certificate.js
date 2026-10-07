// ============================================================
//  Corrige descrições de série conforme o modelo oficial
// ============================================================
function corrigirDescricaoSerie(serie) {
    const s = (serie || '').toUpperCase();

    if (/^6/.test(s)) return '6º ANO DO ENSINO FUNDAMENTAL';
    if (/^7/.test(s)) return '7º ANO';
    if (/^8/.test(s)) return '8º ANO';
    if (/^9/.test(s)) return '9º ANO DO ENSINO FUNDAMENTAL';

    if (/FORMA/i.test(s)) {
        if (/^1/.test(s)) return '1º ANO DO NOVO ENSINO MÉDIO FORMAÇÃO DOCENTE';
        if (/^2/.test(s)) return '2º ANO DO NOVO ENSINO MÉDIO FORMAÇÃO DOCENTE';
        if (/^3/.test(s)) return '3º ANO DO NOVO ENSINO MÉDIO FORMAÇÃO DOCENTE';
    }

    if (/NEM|NOVO ENSINO/i.test(s)) {
        if (/^1/.test(s)) return '1º ANO DO NEM NOVO ENSINO MÉDIO';
        if (/^2/.test(s)) return '2º ANO DO NEM NOVO ENSINO MÉDIO';
        if (/^3/.test(s)) return '3º ANO DO NEM NOVO ENSINO MÉDIO';
    }

    return serie;
}

// ============================================================
//  Preenche o template HTML do certificado
// ============================================================
function preencherTemplate(aluno, trimestre) {
    document.getElementById('cert-nome').textContent = aluno.nome.toUpperCase();

    const descricao = aluno.turma.descricao || aluno.turma.serie;
    document.getElementById('cert-serie').textContent =
        corrigirDescricaoSerie(descricao);

    document.getElementById('cert-letra').textContent = aluno.turma.letra || 'A';
    document.getElementById('cert-trimestre').textContent = trimestre + '°';
    document.getElementById('cert-ano').textContent = CONFIG.anoLetivo;
    document.getElementById('cert-data').textContent =
        CONFIG.cidade + ', ' + CONFIG.datasTrimestres[trimestre];
}

// ============================================================
//  Gera 1 certificado como Blob (PDF)
// ============================================================
async function gerarCertificadoBlob(aluno, trimestre) {
    preencherTemplate(aluno, trimestre);

    if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
    }

    const elemento = document.getElementById('cert-render');

    const canvas = await html2canvas(elemento, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff'
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    const { jsPDF } = window.jspdf;

    const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'px',
        format: [842, 595]
    });

    doc.addImage(imgData, 'JPEG', 0, 0, 842, 595);
    return doc.output('blob');
}

// ============================================================
//  Abre certificado em nova aba (navegador/impressão)
// ============================================================
async function preVisualizarCertificado(aluno, trimestre) {
    const blob = await gerarCertificadoBlob(aluno, trimestre);
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
}

// ============================================================
//  Preenche o preview do certificado no modal
//  (reutiliza o mesmo elemento #cert-render)
// ============================================================
function renderizarPreviewNoModal(aluno, trimestre) {
    preencherTemplate(aluno, trimestre);

    const origem = document.getElementById('cert-render');
    const destino = document.getElementById('preview-container');

    // Clona o certificado para o modal
    const clone = origem.cloneNode(true);
    clone.removeAttribute('id');
    clone.classList.add('certificate-preview');

    destino.innerHTML = '';
    destino.appendChild(clone);
}

// ============================================================
//  Gera certificado fictício para teste
// ============================================================
async function gerarCertificadoTeste(trimestre) {
    const alunoTeste = {
        numero: 0,
        nome: "ALUNO DE TESTE DA SILVA",
        turma: {
            serie: "7º ANO",
            letra: "A",
            descricao: "7º ANO"
        },
        notasTrimestre: [10, 9, 8.5, 9, 10, 8, 9, 10, 8.5, 9, 10, 8, 9],
        elegivel: true
    };

    const blob = await gerarCertificadoBlob(alunoTeste, trimestre);
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
}
