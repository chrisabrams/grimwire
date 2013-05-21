grimWidgets.dismissRegion = function(el, containerEl) {
  $('[data-dismiss="region"]').on('click', function() {
    if (!containerEl || !containerEl.id)
      return;
    var region = local.env.getClientRegion(containerEl.id);
    if (region)
      region.dismiss();
  });
};
