grimWidgets.value_of = function(el, containerEl) {
  $("[data-value-valueof]", el).each(function(i, inputEl) {
    $(containerEl).on('request', function(e) {
      if (!inputEl)
        return;
      var $target = $(inputEl.dataset.valueValueof, containerEl);
      if ($target.tagName == 'INPUT' || $target.tagName == 'TEXTAREA')
        inputEl.value = $target.val();
      else
        inputEl.value = $target.attr('value');
    });
  });
  $("[data-value-idof]", el).each(function(i, inputEl) {
    $(containerEl).on('request', function(e) {
      if (!inputEl)
        return;
      inputEl.value = $(inputEl.dataset.valueIdof, containerEl).getAttribute('id');
    });
  });
  $("[data-value-classof]", el).each(function(i, inputEl) {
    $(containerEl).on('request', function(e) {
      if (!inputEl)
        return;
      inputEl.value = $(inputEl.dataset.valueClassof, containerEl).attr('class');
    });
  });  
};