// ============================================================
//  Preenche o template HTML do certificado
// ============================================================
function preencherTemplate(aluno, trimestre) {
    document.getElementById('cert-nome').textContent = aluno.nome;
    document.getElementById('cert-serie').textContent =
        aluno.turma.descricao || (aluno.turma.serie + ' DO ENSINO FUNDAMENTAL');
    document.getElementById('cert-letra').textContent = aluno.turma.letra || 'A';
    document.getElementById('cert-trimestre').textContent = trimestre + 'º';
    document.getElementById('cert-ano').textContent = CONFIG.anoLetivo;
    document.getElementById('cert-data').textContent =
        CONFIG.cidade + ', ' + CONFIG.datasTrimestres[trimestre];
}

// ============================================================
//  Gera 1 certificado como Blob (PDF)
// ============================================================
async function gerarCertificadoBlob(aluno, trimestre) {
    preencherTemplate(aluno, trimestre);

    // Aguarda fontes
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
//  Pré-visualiza 1 certificado
// ============================================================
async function preVisualizarCertificado(aluno, trimestre) {
    const blob = await gerarCertificadoBlob(aluno, trimestre);
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
}
