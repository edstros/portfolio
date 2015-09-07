/*jshint unused: true, node: true */
/*jslint unparam: true, node: true */

  $('.scrollSection').scrollNav({
    showHeadline: 'false',
    speed: 350,
    fixedMargin: 60,
    scrollOffset: 80
  });
  var $item = $('.scroll-nav__item');
  $.each($item, function () {
    $text = $(this).find('a').html().toLowerCase();
    $(this).addClass($text);
  });
