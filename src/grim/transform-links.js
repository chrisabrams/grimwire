(function() {
  function handleTransformDragstart(e) {
    var elem = e.target;
    if (elem.tagName != 'A' || !elem.classList.contains('transform'))
      return;

    if (!elem.getAttribute('href'))
      e.dataTransfer.effectAllowed = 'none';
    else {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/transform-href', elem.getAttribute('href'));
    }
  }

  document.addEventListener('dragstart', handleTransformDragstart);
})();