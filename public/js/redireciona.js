// Links antigos do painel (/?cargo=…&uf=…) continuam abrindo a apuração, agora em /apuracao.
// Script clássico no <head>: redireciona antes de a página inicial aparecer.
(function () {
  var p = new URLSearchParams(location.search);
  var chaves = ['cargo', 'uf', 'exterior', 'mapa', 'grafico'];
  for (var i = 0; i < chaves.length; i++) {
    if (p.has(chaves[i])) return location.replace('/apuracao' + location.search + location.hash);
  }
})();
