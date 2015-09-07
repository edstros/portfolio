/*! scrollNav - v2.6.0 - 2015-02-19
* http://scrollnav.com
* Copyright (c) 2015 James Wilson; Licensed MIT */
'use strict';

(function ($) {

  // Animate scrolling to section location
  var scroll_to = function scroll_to(value, speed, offset, animated) {
    if ($(value).length > 0) {
      var destination = $(value).offset().top;
      speed = animated ? speed : 0;

      $('html:not(:animated),body:not(:animated)').animate({ scrollTop: destination - offset }, speed);
    }
  };

  // Get url hash if one exists
  var get_hash = function get_hash() {
    return window.location.hash;
  };

  var S = {
    classes: {
      loading: 'sn-loading',
      failed: 'sn-failed',
      success: 'sn-active'
    },
    defaults: {
      sections: 'h2',
      subSections: false,
      sectionElem: 'section',
      className: 'scroll-nav',
      showHeadline: true,
      headlineText: 'Scroll To',
      showTopLink: true,
      topLinkText: 'Top',
      fixedMargin: 40,
      scrollOffset: 40,
      animated: true,
      speed: 500,
      insertLocation: 'insertBefore',
      arrowKeys: false,
      scrollToHash: true,
      onInit: null,
      onRender: null,
      onDestroy: null,
      onResetPos: null
    },
    _set_body_class: function _set_body_class(state) {
      // Set and swap our loading hooks to the body

      var $body = $('body');

      if (state === 'loading') {
        $body.addClass(S.classes.loading);
      } else if (state === 'success') {
        $body.removeClass(S.classes.loading).addClass(S.classes.success);
      } else {
        $body.removeClass(S.classes.loading).addClass(S.classes.failed);
      }
    },
    _find_sections: function _find_sections($el) {
      // Find the html for each section

      var target_elems = S.settings.sections;
      var raw_html = [];

      if (S.settings.showTopLink) {
        var $firstElem = $el.children().first();

        if (!$firstElem.is(target_elems)) {
          raw_html.push($firstElem.nextUntil(target_elems).andSelf());
        }
      }

      $el.find(target_elems).each(function () {
        raw_html.push($(this).nextUntil(target_elems).andSelf());
      });

      S.sections = {
        raw: raw_html
      };
    },
    _setup_sections: function _setup_sections(sections) {
      // Wrap each section and add it's details to the section array

      var section_data = [];

      $(sections).each(function (i) {
        var sub_data = [];
        var $this_section = $(this);
        var section_id = 'scrollNav-' + (i + 1);
        var isFirst = function isFirst() {
          return i === 0;
        };
        var hasHeading = function hasHeading() {
          return !$this_section.eq(0).is(S.settings.sections);
        };
        var text = S.settings.showTopLink && isFirst() && hasHeading() ? S.settings.topLinkText : $this_section.filter(S.settings.sections).text();

        $this_section.wrapAll('<' + S.settings.sectionElem + ' id="' + section_id + '" class="' + S.settings.className + '__section" />');

        if (S.settings.subSections) {
          var $sub_sections = $this_section.filter(S.settings.subSections);

          if ($sub_sections.length > 0) {
            $sub_sections.each(function (i) {
              var sub_id = section_id + '-' + (i + 1);
              var sub_text = $(this).text();
              var $this_sub = $this_section.filter($(this).nextUntil($sub_sections).andSelf());

              $this_sub.wrapAll('<div id="' + sub_id + '" class="' + S.settings.className + '__sub-section" />');
              sub_data.push({ id: sub_id, text: sub_text });
            });
          }
        }

        section_data.push({ id: section_id, text: text, sub_sections: sub_data });
      });

      S.sections.data = section_data;
    },
    _tear_down_sections: function _tear_down_sections(sections) {
      $(sections).each(function () {
        var sub_sections = this.sub_sections;

        $('#' + this.id).children().unwrap();

        if (sub_sections.length > 0) {
          $(sub_sections).each(function () {
            $('#' + this.id).children().unwrap();
          });
        }
      });
    },
    _setup_nav: function _setup_nav(sections) {
      // Populate an ordered list from the section array we built

      var $headline = $('<span />', { 'class': S.settings.className + '__heading', text: S.settings.headlineText });
      var $wrapper = $('<div />', { 'class': S.settings.className + '__wrapper' });
      var $nav = $('<nav />', { 'class': S.settings.className, 'role': 'navigation' });
      var $nav_list = $('<ol />', { 'class': S.settings.className + '__list' });

      $.each(sections, function (i) {
        var $item = i === 0 ? $('<li />', { 'class': S.settings.className + '__item active' }) : $('<li />', { 'class': S.settings.className + '__item' });
        var $link = $('<a />', { 'href': '#' + this.id, 'class': S.settings.className + '__link', text: this.text });
        var $sub_nav_list;

        if (this.sub_sections.length > 0) {
          $item.addClass('is-parent-item');
          $sub_nav_list = $('<ol />', { 'class': S.settings.className + '__sub-list' });

          $.each(this.sub_sections, function () {
            var $sub_item = $('<li />', { 'class': S.settings.className + '__sub-item' });
            var $sub_link = $('<a />', { 'href': '#' + this.id, 'class': S.settings.className + '__sub-link', text: this.text });

            $sub_nav_list.append($sub_item.append($sub_link));
          });
        }

        $nav_list.append($item.append($link).append($sub_nav_list));
      });

      if (S.settings.showHeadline) {
        $nav.append($wrapper.append($headline).append($nav_list));
      } else {
        $nav.append($wrapper.append($nav_list));
      }

      S.nav = $nav;
    },
    _insert_nav: function _insert_nav() {
      // Add the nav to our page

      var insert_location = S.settings.insertLocation;
      var $insert_target = S.settings.insertTarget;

      S.nav[insert_location]($insert_target);
    },
    _setup_pos: function _setup_pos() {
      // Find the offset positions of each section

      var $nav = S.nav;
      var vp_height = $(window).height();
      var nav_offset = $nav.offset().top;

      var set_offset = function set_offset(section) {
        var $this_section = $('#' + section.id);
        var this_height = $this_section.height();

        section.top_offset = $this_section.offset().top;
        section.bottom_offset = section.top_offset + this_height;
      };

      $.each(S.sections.data, function () {
        set_offset(this);

        $.each(this.sub_sections, function () {
          set_offset(this);
        });
      });

      S.dims = {
        vp_height: vp_height,
        nav_offset: nav_offset
      };
    },
    _check_pos: function _check_pos() {
      // Set nav to fixed after scrolling past the header and add an in-view class to any
      // sections currently within the bounds of our view and active class to the first
      // in-view section

      var $nav = S.nav;
      var win_top = $(window).scrollTop();
      var boundry_top = win_top + S.settings.scrollOffset;
      var boundry_bottom = win_top + S.dims.vp_height - S.settings.scrollOffset;
      var sections_active = [];
      var sub_sections_active = [];

      if (win_top > S.dims.nav_offset - S.settings.fixedMargin) {
        $nav.addClass('fixed');
      } else {
        $nav.removeClass('fixed');
      }

      var in_view = function in_view(section) {
        return section.top_offset >= boundry_top && section.top_offset <= boundry_bottom || section.bottom_offset > boundry_top && section.bottom_offset < boundry_bottom || section.top_offset < boundry_top && section.bottom_offset > boundry_bottom;
      };

      $.each(S.sections.data, function () {
        if (in_view(this)) {
          sections_active.push(this);
        }
        $.each(this.sub_sections, function () {
          if (in_view(this)) {
            sub_sections_active.push(this);
          }
        });
      });

      $nav.find('.' + S.settings.className + '__item').removeClass('active').removeClass('in-view');
      $nav.find('.' + S.settings.className + '__sub-item').removeClass('active').removeClass('in-view');

      $.each(sections_active, function (i) {
        if (i === 0) {
          $nav.find('a[href="#' + this.id + '"]').parents('.' + S.settings.className + '__item').addClass('active').addClass('in-view');
        } else {
          $nav.find('a[href="#' + this.id + '"]').parents('.' + S.settings.className + '__item').addClass('in-view');
        }
      });
      S.sections.active = sections_active;

      $.each(sub_sections_active, function (i) {
        if (i === 0) {
          $nav.find('a[href="#' + this.id + '"]').parents('.' + S.settings.className + '__sub-item').addClass('active').addClass('in-view');
        } else {
          $nav.find('a[href="#' + this.id + '"]').parents('.' + S.settings.className + '__sub-item').addClass('in-view');
        }
      });
    },
    _init_scroll_listener: function _init_scroll_listener() {
      // Set a scroll listener to update the fixed and active classes

      $(window).on('scroll.scrollNav', function () {
        S._check_pos();
      });
    },
    _rm_scroll_listeners: function _rm_scroll_listeners() {
      $(window).off('scroll.scrollNav');
    },
    _init_resize_listener: function _init_resize_listener() {
      // Set a resize listener to update position values and the fixed and active classes

      $(window).on('resize.scrollNav', function () {
        S._setup_pos();
        S._check_pos();
      });
    },
    _rm_resize_listener: function _rm_resize_listener() {
      $(window).off('resize.scrollNav');
    },
    _init_click_listener: function _init_click_listener() {
      // Scroll to section on click

      $('.' + S.settings.className).find('a').on('click.scrollNav', function (e) {
        e.preventDefault();

        var value = $(this).attr('href');
        var speed = S.settings.speed;
        var offset = S.settings.scrollOffset;
        var animated = S.settings.animated;

        scroll_to(value, speed, offset, animated);
      });
    },
    _rm_click_listener: function _rm_click_listener() {
      $('.' + S.settings.className).find('a').off('click.scrollNav');
    },
    _init_keyboard_listener: function _init_keyboard_listener(sections) {
      // Scroll to section on arrow key press

      if (S.settings.arrowKeys) {
        $(document).on('keydown.scrollNav', function (e) {
          if (e.keyCode === 40 || e.keyCode === 38) {
            var findSection = function findSection(key) {
              var i = 0;
              var l = sections.length;

              for (i; i < l; i++) {
                if (sections[i].id === S.sections.active[0].id) {
                  var array_offset = key === 40 ? i + 1 : i - 1;
                  var id = sections[array_offset] === undefined ? undefined : sections[array_offset].id;

                  return id;
                }
              }
            };

            var target_section = findSection(e.keyCode);

            if (target_section !== undefined) {
              e.preventDefault();

              var value = '#' + target_section;
              var speed = S.settings.speed;
              var offset = S.settings.scrollOffset;
              var animated = S.settings.animated;

              scroll_to(value, speed, offset, animated);
            }
          }
        });
      }
    },
    _rm_keyboard_listener: function _rm_keyboard_listener() {
      $(document).off('keydown.scrollNav');
    },
    init: function init(options) {
      return this.each(function () {
        var $el = $(this);

        // Merge default settings with user defined options
        S.settings = $.extend({}, S.defaults, options);

        // If the insert target isn't set, use the initialized element
        S.settings.insertTarget = S.settings.insertTarget ? $(S.settings.insertTarget) : $el;

        if ($el.length > 0) {
          // Initialize

          // Fire custom init callback
          if (S.settings.onInit) {
            S.settings.onInit.call(this);
          }

          S._set_body_class('loading');
          S._find_sections($el);

          if ($el.find(S.settings.sections).length > 0) {
            // BUILD!!!!

            S._setup_sections(S.sections.raw);
            S._setup_nav(S.sections.data);

            if (S.settings.insertTarget.length > 0) {
              //Add to page

              S._insert_nav();
              S._setup_pos();
              S._check_pos();
              S._init_scroll_listener();
              S._init_resize_listener();
              S._init_click_listener();
              S._init_keyboard_listener(S.sections.data);
              S._set_body_class('success');
              if (S.settings.scrollToHash) {
                scroll_to(get_hash());
              }

              // Fire custom render callback
              if (S.settings.onRender) {
                S.settings.onRender.call(this);
              }
            } else {
              console.log('Build failed, scrollNav could not find "' + S.settings.insertTarget + '"');
              S._set_body_class('failed');
            }
          } else {
            console.log('Build failed, scrollNav could not find any "' + S.settings.sections + 's" inside of "' + $el.selector + '"');
            S._set_body_class('failed');
          }
        } else {
          console.log('Build failed, scrollNav could not find "' + $el.selector + '"');
          S._set_body_class('failed');
        }
      });
    },
    destroy: function destroy() {
      return this.each(function () {

        // Unbind event listeners
        S._rm_scroll_listeners();
        S._rm_resize_listener();
        S._rm_click_listener();
        S._rm_keyboard_listener();

        // Remove any of the loading hooks
        $('body').removeClass('sn-loading sn-active sn-failed');

        // Remove the nav from the dom
        $('.' + S.settings.className).remove();

        // Teardown sections
        S._tear_down_sections(S.sections.data);

        // Fire custom destroy callback
        if (S.settings.onDestroy) {
          S.settings.onDestroy.call(this);
        }

        // Remove the saved settings
        S.settings = [];
        S.sections = undefined;
      });
    },
    resetPos: function resetPos() {
      S._setup_pos();
      S._check_pos();

      // Fire custom reset position callback
      if (S.settings.onResetPos) {
        S.settings.onResetPos.call(this);
      }
    }
  };

  $.fn.scrollNav = function () {
    var options;
    var method = arguments[0];

    if (S[method]) {
      // Method exists, so use it

      method = S[method];
      options = Array.prototype.slice.call(arguments, 1);
    } else if (typeof method === 'object' || !method) {
      // No method passed, default to init

      method = S.init;
      options = arguments;
    } else {
      // Method doesn't exist

      $.error('Method ' + method + ' does not exist in the scrollNav plugin');
      return this;
    }

    return method.apply(this, options);
  };
})(jQuery);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInNyYy9qcy9qcXVlcnkuc2Nyb2xsTmF2LmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7O0FBR0EsQ0FBQyxVQUFTLENBQUMsRUFBRTs7O0FBR1gsTUFBSSxTQUFTLEdBQUcsU0FBWixTQUFTLENBQVksS0FBSyxFQUFFLEtBQUssRUFBRSxNQUFNLEVBQUUsUUFBUSxFQUFFO0FBQ3ZELFFBQUssQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUc7QUFDekIsVUFBSSxXQUFXLEdBQUcsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLEdBQUcsQ0FBQztBQUN4QyxXQUFLLEdBQUcsUUFBUSxHQUFHLEtBQUssR0FBRyxDQUFDLENBQUM7O0FBRTdCLE9BQUMsQ0FBQyx5Q0FBeUMsQ0FBQyxDQUN6QyxPQUFPLENBQUMsRUFBQyxTQUFTLEVBQUUsV0FBVyxHQUFHLE1BQU0sRUFBRSxFQUFFLEtBQUssQ0FBRSxDQUFDO0tBQ3hEO0dBQ0YsQ0FBQzs7O0FBR0YsTUFBSSxRQUFRLEdBQUcsU0FBWCxRQUFRLEdBQWM7QUFDeEIsV0FBTyxNQUFNLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQztHQUM3QixDQUFDOztBQUVGLE1BQUksQ0FBQyxHQUFHO0FBQ04sV0FBTyxFQUFFO0FBQ1AsYUFBTyxFQUFFLFlBQVk7QUFDckIsWUFBTSxFQUFFLFdBQVc7QUFDbkIsYUFBTyxFQUFFLFdBQVc7S0FDckI7QUFDRCxZQUFRLEVBQUU7QUFDUixjQUFRLEVBQUUsSUFBSTtBQUNkLGlCQUFXLEVBQUUsS0FBSztBQUNsQixpQkFBVyxFQUFFLFNBQVM7QUFDdEIsZUFBUyxFQUFFLFlBQVk7QUFDdkIsa0JBQVksRUFBRSxJQUFJO0FBQ2xCLGtCQUFZLEVBQUUsV0FBVztBQUN6QixpQkFBVyxFQUFFLElBQUk7QUFDakIsaUJBQVcsRUFBRSxLQUFLO0FBQ2xCLGlCQUFXLEVBQUUsRUFBRTtBQUNmLGtCQUFZLEVBQUUsRUFBRTtBQUNo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MUIsUUFBSSxPQUFPLENBQUM7QUFDWixRQUFJLE1BQU0sR0FBSSxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUM7O0FBRTNCLFFBQUksQ0FBQyxDQUFDLE1BQU0sQ0FBQyxFQUFFOzs7QUFHYixZQUFNLEdBQUksQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDO0FBQ3BCLGFBQU8sR0FBRyxLQUFLLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQyxDQUFDO0tBQ3BELE1BQU0sSUFBSSxPQUFPLE1BQU0sQUFBQyxLQUFLLFFBQVEsSUFBSSxDQUFDLE1BQU0sRUFBRTs7O0FBR2pELFlBQU0sR0FBSSxDQUFDLENBQUMsSUFBSSxDQUFDO0FBQ2pCLGFBQU8sR0FBRyxTQUFTLENBQUM7S0FDckIsTUFBTTs7O0FBR0wsT0FBQyxDQUFDLEtBQUssQ0FBRSxTQUFTLEdBQUksTUFBTSxHQUFHLHlDQUF5QyxDQUFFLENBQUM7QUFDM0UsYUFBTyxJQUFJLENBQUM7S0FDYjs7QUFFRCxXQUFPLE1BQU0sQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLE9BQU8sQ0FBQyxDQUFDO0dBQ3BDLENBQUM7Q0FDSCxDQUFBLENBQUUsTUFBTSxDQUFDLENBQUMiLCJmaWxlIjoic3JjL2pzL2pxdWVyeS5zY3JvbGxOYXYuanMiLCJzb3VyY2VzQ29udGVudCI6WyIvKiEgc2Nyb2xsTmF2IC0gdjIuNi4wIC0gMjAxNS0wMi0xOVxuKiBodHRwOi8vc2Nyb2xsbmF2LmNvbVxuKiBDb3B5cmlnaHQgKGMpIDIwMTUgSmFtZXMgV2lsc29uOyBMaWNlbnNlZCBNSVQgKi9cbihmdW5jdGlvbigkKSB7XG5cbiAgLy8gQW5pbWF0ZSBzY3JvbGxpbmcgdG8gc2VjdGlvbiBsb2NhdGlvblxuICB2YXIgc2Nyb2xsX3RvID0gZnVuY3Rpb24odmFsdWUsIHNwZWVkLCBvZmZzZXQsIGFuaW1hdGVkKSB7XG4gICAgaWYgKCAkKHZhbHVlKS5sZW5ndGggPiAwICkge1xuICAgICAgdmFyIGRlc3RpbmF0aW9uID0gJCh2YWx1ZSkub2Zmc2V0KCkudG9wO1xuICAgICAgc3BlZWQgPSBhbmltYXRlZCA/IHNwZWVkIDogMDtcblxuICAgICAgJCgnaHRtbDpub3QoOmFuaW1hdGVkKSxib2R5Om5vdCg6YW5pbWF0ZWQpJylcbiAgICAgICAgLmFuaW1hdGUoe3Njcm9sbFRvcDogZGVzdGluYXRpb24gLSBvZmZzZXQgfSwgc3BlZWQgKTtcbiAgICB9XG4gIH07XG5cbiAgLy8gR2V0IHVybCBoYXNoIGlmIG9uZSBleGlzdHNcbiAgdmFyIGdldF9oYXNoID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIHdpbmRvdy5sb2NhdGlvbi5oYXNoO1xuICB9O1xuXG4gIHZhciBTID0ge1xuICAgIGNsYXNzZXM6IHtcbiAgICAgIGxvYWRpbmc6ICdzbi1sb2FkaW5nJyxcbiAgICAgIGZhaWxlZDogJ3NuLWZhaWxlZCcsXG4gICAgICBzdWNjZXNzOiAnc24tYWN0aXZlJ1xuICAgIH0sXG4gICAgZGVmYXVsdHM6IHtcbiAgICAgIHNlY3Rpb25zOiAnaDInLFxuICAgICAgc3ViU2VjdGlvbnM6IGZhbHNlLFxuICAgICAgc2VjdGlvbkVsZW06ICdzZWN0aW9uJyxcbiAgICAgIGNsYXNzTmFtZTogJ3Njcm9sbC1uYXYnLFxuICAgICAgc2hvd0hlYWRsaW5lOiB0cnVlLFxuICAgICAgaGVhZGxpbmVUZXh0OiAnU2Nyb2xsIFRvJyxcbiAgICAgIHNob3dUb3BMaW5rOiB0cnVlLFxuICAgICAgdG9wTGlua1RleHQ6ICdUb3AnLFxuICAgICAgZml4ZWRNYXJnaW46IDQwLFxuICAgICAgc2Nyb2xsT2Zmc2V0OiA0MCxcbiAgICAgIGFuaW1hdGVkOiB0cnVlLFxuICAgICAgc3BlZWQ6IDUwMCxcbiAgICAgIGluc2VydExvY2F0aW9uOiAnaW5zZXJ0QmVmb3JlJyxcbiAgICAgIGFycm93S2V5czogZmFsc2UsXG4gICAgICBzY3JvbGxUb0hhc2g6IHRydWUsXG4gICAgICBvbkluaXQ6IG51bGwsXG4gICAgICBvblJlbmRlcjogbnVsbCxcbiAgICAgIG9uRGVzdHJveTogbnVsbCxcbiAgICAgIG9uUmVzZXRQb3M6IG51bGxcbiAgICB9LFxuICAgIF9zZXRfYm9keV9jbGFzczogZnVuY3Rpb24oc3RhdGUpIHtcbiAgICAgIC8vIFNldCBhbmQgc3dhcCBvdXIgbG9hZGluZyBob29rcyB0byB0aGUgYm9keVxuXG4gICAgICB2YXIgJGJvZHkgPSAkKCdib2R5Jyk7XG5cbiAgICAgIGlmIChzdGF0ZSA9PT0gJ2xvYWRpbmcnKSB7XG4gICAgICAgICRib2R5LmFkZENsYXNzKFMuY2xhc3Nlcy5sb2FkaW5nKTtcbiAgICAgIH0gZWxzZSBpZiAoc3RhdGUgPT09ICdzdWNjZXNzJykge1xuICAgICAgICAkYm9keS5yZW1vdmVDbGFzcyhTLmNsYXNzZXMubG9hZGluZykuYWRkQ2xhc3MoUy5jbGFzc2VzLnN1Y2Nlc3MpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgJGJvZHkucmVtb3ZlQ2xhc3MoUy5jbGFzc2VzLmxvYWRpbmcpLmFkZENsYXNzKFMuY2xhc3Nlcy5mYWlsZWQpO1xuICAgICAgfVxuICAgIH0sXG4gICAgX2ZpbmRfc2VjdGlvbnM6IGZ1bmN0aW9uKCRlbCkge1xuICAgICAgLy8gRmluZCB0aGUgaHRtbCBmb3IgZWFjaCBzZWN0aW9uXG5cbiAgICAgIHZhciB0YXJnZXRfZWxlbXMgPSBTLnNldHRpbmdzLnNlY3Rpb25zO1xuICAgICAgdmFyIHJhd19odG1sID0gW107XG5cbiAgICAgIGlmIChTLnNldHRpbmdzLnNob3dUb3BMaW5rKSB7XG4gICAgICAgIHZhciAkZmlyc3RFbGVtID0gJGVsLmNoaWxkcmVuKCkuZmlyc3QoKTtcblxuICAgICAgICBpZiAoICEkZmlyc3RFbGVtLmlzKHRhcmdldF9lbGVtcykgKSB7XG4gICAgICAgICAgcmF3X2h0bWwucHVzaCggJGZpcnN0RWxlbS5uZXh0VW50aWwodGFyZ2V0X2VsZW1zKS5hbmRTZWxmKCkgKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAkZWwuZmluZCh0YXJnZXRfZWxlbXMpLmVhY2goZnVuY3Rpb24oKSB7XG4gICAgICAgIHJhd19odG1sLnB1c2goICQodGhpcykubmV4dFVudGlsKHRhcmdldF9lbGVtcykuYW5kU2VsZigpICk7XG4gICAgICB9KTtcblxuICAgICAgUy5zZWN0aW9ucyA9IHtcbiAgICAgICAgcmF3OiByYXdfaHRtbFxuICAgICAgfTtcbiAgICB9LFxuICAgIF9zZXR1cF9zZWN0aW9uczogZnVuY3Rpb24oc2VjdGlvbnMpIHtcbiAgICAgIC8vIFdyYXAgZWFjaCBzZWN0aW9uIGFuZCBhZGQgaXQncyBkZXRhaWxzIHRvIHRoZSBzZWN0aW9uIGFycmF5XG5cbiAgICAgIHZhciBzZWN0aW9uX2RhdGEgPSBbXTtcblxuICAgICAgJChzZWN0aW9ucykuZWFjaChmdW5jdGlvbihpKSB7XG4gICAgICAgIHZhciBzdWJfZGF0YSAgICAgID0gW107XG4gICAgICAgIHZhciAkdGhpc19zZWN0aW9uID0gJCh0aGlzKTtcbiAgICAgICAgdmFyIHNlY3Rpb25faWQgICAgPSAnc2Nyb2xsTmF2LScgKyAoaSArIDEpO1xuICAgICAgICB2YXIgaXNGaXJzdCAgICAgICA9IGZ1bmN0aW9uKCkgeyByZXR1cm4gaSA9PT0gMDsgfTtcbiAgICAgICAgdmFyIGhhc0hlYWRpbmcgICAgPSBmdW5jdGlvbigpIHsgcmV0dXJuICEkdGhpc19zZWN0aW9uLmVxKDApLmlzKFMuc2V0dGluZ3Muc2VjdGlvbnMpOyB9O1xuICAgICAgICB2YXIgdGV4dCAgICAgICAgICA9ICggUy5zZXR0aW5ncy5zaG93VG9wTGluayAmJiBpc0ZpcnN0KCkgJiYgaGFzSGVhZGluZygpICkgPyBTLnNldHRpbmdzLnRvcExpbmtUZXh0IDogJHRoaXNfc2VjdGlvbi5maWx0ZXIoUy5zZXR0aW5ncy5zZWN0aW9ucykudGV4dCgpO1xuXG4gICAgICAgICR0aGlzX3NlY3Rpb24ud3JhcEFsbCgnPCcgKyBTLnNldHRpbmdzLnNlY3Rpb25FbGVtICsgJyBpZD1cIicgKyBzZWN0aW9uX2lkICsgJ1wiIGNsYXNzPVwiJyArIFMuc2V0dGluZ3MuY2xhc3NOYW1lICsgJ19fc2VjdGlvblwiIC8+Jyk7XG5cbiAgICAgICAgaWYgKFMuc2V0dGluZ3Muc3ViU2VjdGlvbnMpIHtcbiAgICAgICAgICB2YXIgJHN1Yl9zZWN0aW9ucyAgPSAkdGhpc19zZWN0aW9uLmZpbHRlcihTLnNldHRpbmdzLnN1YlNlY3Rpb25zKTtcblxuICAgICAgICAgIGlmICgkc3ViX3NlY3Rpb25zLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICRzdWJfc2VjdGlvbnMuZWFjaChmdW5jdGlvbihpKSB7XG4gICAgICAgICAgICAgIHZhciBzdWJfaWQgICAgICA9IHNlY3Rpb25faWQgKyAnLScgKyAoaSArIDEpO1xuICAgICAgICAgICAgICB2YXIgc3ViX3RleHQgICAgPSAkKHRoaXMpLnRleHQoKTtcbiAgICAgICAgICAgICAgdmFyICR0aGlzX3N1YiAgID0gJHRoaXNfc2VjdGlvbi5maWx0ZXIoJCh0aGlzKS5uZXh0VW50aWwoJHN1Yl9zZWN0aW9ucykuYW5kU2VsZigpKTtcblxuICAgICAgICAgICAgICAkdGhpc19zdWIud3JhcEFsbCgnPGRpdiBpZD1cIicgKyBzdWJfaWQgKyAnXCIgY2xhc3M9XCInICsgUy5zZXR0aW5ncy5jbGFzc05hbWUgKyAnX19zdWItc2VjdGlvblwiIC8+Jyk7XG4gICAgICAgICAgICAgIHN1Yl9kYXRhLnB1c2goIHtpZDogc3ViX2lkLCB0ZXh0OiBzdWJfdGV4dH0gKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHNlY3Rpb25fZGF0YS5wdXNoKCB7aWQ6IHNlY3Rpb25faWQsIHRleHQ6IHRleHQsIHN1Yl9zZWN0aW9uczogc3ViX2RhdGF9ICk7XG4gICAgICB9KTtcblxuICAgICAgUy5zZWN0aW9ucy5kYXRhID0gc2VjdGlvbl9kYXRhO1xuICAgIH0sXG4gICAgX3RlYXJfZG93bl9zZWN0aW9uczogZnVuY3Rpb24oc2VjdGlvbnMpIHtcbiAgICAgICQoc2VjdGlvbnMpLmVhY2goZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciBzdWJfc2VjdGlvbnMgPSB0aGlzLnN1Yl9zZWN0aW9ucztcblxuICAgICAgICAkKCcjJyArIHRoaXMuaWQpLmNoaWxkcmVuKCkudW53cmFwKCk7XG5cbiAgICAgICAgaWYgKHN1Yl9zZWN0aW9ucy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgJChzdWJfc2VjdGlvbnMpLmVhY2goZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAkKCcjJyArIHRoaXMuaWQpLmNoaWxkcmVuKCkudW53cmFwKCk7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0sXG4gICAgX3NldHVwX25hdjogZnVuY3Rpb24oc2VjdGlvbnMpIHtcbiAgICAvLyBQb3B1bGF0ZSBhbiBvcmRlcmVkIGxpc3QgZnJvbSB0aGUgc2VjdGlvbiBhcnJheSB3ZSBidWlsdFxuXG4gICAgICB2YXIgJGhlYWRsaW5lID0gJCgnPHNwYW4gLz4nLCB7J2NsYXNzJzogUy5zZXR0aW5ncy5jbGFzc05hbWUgKyAnX19oZWFkaW5nJywgdGV4dDogUy5zZXR0aW5ncy5oZWFkbGluZVRleHR9KTtcbiAgICAgIHZhciAkd3JhcHBlciAgPSAkKCc8ZGl2IC8+JywgeydjbGFzcyc6IFMuc2V0dGluZ3MuY2xhc3NOYW1lICsgJ19fd3JhcHBlcid9KTtcbiAgICAgIHZhciAkbmF2ICAgICAgPSAkKCc8bmF2IC8+JywgeydjbGFzcyc6IFMuc2V0dGluZ3MuY2xhc3NOYW1lLCAncm9sZSc6ICduYXZpZ2F0aW9uJ30pO1xuICAgICAgdmFyICRuYXZfbGlzdCA9ICQoJzxvbCAvPicsIHsnY2xhc3MnOiBTLnNldHRpbmdzLmNsYXNzTmFtZSArICdfX2xpc3QnfSk7XG5cbiAgICAgICQuZWFjaChzZWN0aW9ucywgZnVuY3Rpb24oaSkge1xuICAgICAgICB2YXIgJGl0ZW0gICAgID0gKGkgPT09IDApID8gJCgnPGxpIC8+JywgeydjbGFzcyc6IFMuc2V0dGluZ3MuY2xhc3NOYW1lICsgJ19faXRlbSBhY3RpdmUnfSkgOiAkKCc8bGkgLz4nLCB7J2NsYXNzJzogUy5zZXR0aW5ncy5jbGFzc05hbWUgKyAnX19pdGVtJ30pO1xuICAgICAgICB2YXIgJGxpbmsgICAgID0gJCgnPGEgLz4nLCB7J2hyZWYnOiAnIycgKyB0aGlzLmlkLCAnY2xhc3MnOiBTLnNldHRpbmdzLmNsYXNzTmFtZSArICdfX2xpbmsnLCB0ZXh0OiB0aGlzLnRleHR9KTtcbiAgICAgICAgdmFyICRzdWJfbmF2X2xpc3Q7XG5cbiAgICAgICAgaWYgKHRoaXMuc3ViX3NlY3Rpb25zLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAkaXRlbS5hZGRDbGFzcygnaXMtcGFyZW50LWl0ZW0nKTtcbiAgICAgICAgICAkc3ViX25hdl9saXN0ID0gJCgnPG9sIC8+JywgeydjbGFzcyc6IFMuc2V0dGluZ3MuY2xhc3NOYW1lICsgJ19fc3ViLWxpc3QnfSk7XG5cbiAgICAgICAgICAkLmVhY2godGhpcy5zdWJfc2VjdGlvbnMsIGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgdmFyICRzdWJfaXRlbSA9ICQoJzxsaSAvPicsIHsnY2xhc3MnOiBTLnNldHRpbmdzLmNsYXNzTmFtZSArICdfX3N1Yi1pdGVtJ30pO1xuICAgICAgICAgICAgdmFyICRzdWJfbGluayA9ICQoJzxhIC8+JywgeydocmVmJzogJyMnICsgdGhpcy5pZCwgJ2NsYXNzJzogUy5zZXR0aW5ncy5jbGFzc05hbWUgKyAnX19zdWItbGluaycsIHRleHQ6IHRoaXMudGV4dH0pO1xuXG4gICAgICAgICAgICAkc3ViX25hdl9saXN0LmFwcGVuZCggJHN1Yl9pdGVtLmFwcGVuZCgkc3ViX2xpbmspICk7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICAkbmF2X2xpc3QuYXBwZW5kKCAkaXRlbS5hcHBlbmQoJGxpbmspLmFwcGVuZCgkc3ViX25hdl9saXN0KSApO1xuICAgICAgfSk7XG5cbiAgICAgIGlmIChTLnNldHRpbmdzLnNob3dIZWFkbGluZSkge1xuICAgICAgICAkbmF2LmFwcGVuZCggJHdyYXBwZXIuYXBwZW5kKCRoZWFkbGluZSkuYXBwZW5kKCRuYXZfbGlzdCkgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgICRuYXYuYXBwZW5kKCAkd3JhcHBlci5hcHBlbmQoJG5hdl9saXN0KSApO1xuICAgICAgfVxuXG4gICAgICBTLm5hdiA9ICRuYXY7XG4gICAgfSxcbiAgICBfaW5zZXJ0X25hdjogZnVuY3Rpb24oKSB7XG4gICAgICAvLyBBZGQgdGhlIG5hdiB0byBvdXIgcGFnZVxuXG4gICAgICB2YXIgaW5zZXJ0X2xvY2F0aW9uID0gUy5zZXR0aW5ncy5pbnNlcnRMb2NhdGlvbjtcbiAgICAgIHZhciAkaW5zZXJ0X3RhcmdldCA9IFMuc2V0dGluZ3MuaW5zZXJ0VGFyZ2V0O1xuXG4gICAgICBTLm5hdltpbnNlcnRfbG9jYXRpb25dKCRpbnNlcnRfdGFyZ2V0KTtcbiAgICB9LFxuICAgIF9zZXR1cF9wb3M6IGZ1bmN0aW9uKCkge1xuICAgICAgLy8gRmluZCB0aGUgb2Zmc2V0IHBvc2l0aW9ucyBvZiBlYWNoIHNlY3Rpb25cblxuICAgICAgdmFyICRuYXYgICAgICAgID0gUy5uYXY7XG4gICAgICB2YXIgdnBfaGVpZ2h0ICAgPSAkKHdpbmRvdykuaGVpZ2h0KCk7XG4gICAgICB2YXIgbmF2X29mZnNldCAgPSAkbmF2Lm9mZnNldCgpLnRvcDtcblxuICAgICAgdmFyIHNldF9vZmZzZXQgPSBmdW5jdGlvbihzZWN0aW9uKSB7XG4gICAgICAgIHZhciAkdGhpc19zZWN0aW9uICA9ICQoJyMnICsgc2VjdGlvbi5pZCk7XG4gICAgICAgIHZhciB0aGlzX2hlaWdodCAgICA9ICR0aGlzX3NlY3Rpb24uaGVpZ2h0KCk7XG5cbiAgICAgICAgc2VjdGlvbi50b3Bfb2Zmc2V0ICAgID0gJHRoaXNfc2VjdGlvbi5vZmZzZXQoKS50b3A7XG4gICAgICAgIHNlY3Rpb24uYm90dG9tX29mZnNldCA9IHNlY3Rpb24udG9wX29mZnNldCArIHRoaXNfaGVpZ2h0O1xuICAgICAgfTtcblxuICAgICAgJC5lYWNoKFMuc2VjdGlvbnMuZGF0YSwgZnVuY3Rpb24oKSB7XG4gICAgICAgIHNldF9vZmZzZXQodGhpcyk7XG5cbiAgICAgICAgJC5lYWNoKHRoaXMuc3ViX3NlY3Rpb25zLCBmdW5jdGlvbigpIHtcbiAgICAgICAgICBzZXRfb2Zmc2V0KHRoaXMpO1xuICAgICAgICB9KTtcbiAgICAgIH0pO1xuXG4gICAgICBTLmRpbXMgPSB7XG4gICAgICAgIHZwX2hlaWdodDogIHZwX2hlaWdodCxcbiAgICAgICAgbmF2X29mZnNldDogbmF2X29mZnNldFxuICAgICAgfTtcbiAgICB9LFxuICAgIF9jaGVja19wb3M6IGZ1bmN0aW9uKCkge1xuICAgICAgLy8gU2V0IG5hdiB0byBmaXhlZCBhZnRlciBzY3JvbGxpbmcgcGFzdCB0aGUgaGVhZGVyIGFuZCBhZGQgYW4gaW4tdmlldyBjbGFzcyB0byBhbnlcbiAgICAgIC8vIHNlY3Rpb25zIGN1cnJlbnRseSB3aXRoaW4gdGhlIGJvdW5kcyBvZiBvdXIgdmlldyBhbmQgYWN0aXZlIGNsYXNzIHRvIHRoZSBmaXJzdFxuICAgICAgLy8gaW4tdmlldyBzZWN0aW9uXG5cbiAgICAgIHZhciAkbmF2ICAgICAgICAgICAgICAgID0gUy5uYXY7XG4gICAgICB2YXIgd2luX3RvcCAgICAgICAgICAgICA9ICQod2luZG93KS5zY3JvbGxUb3AoKTtcbiAgICAgIHZhciBib3VuZHJ5X3RvcCAgICAgICAgID0gd2luX3RvcCArIFMuc2V0dGluZ3Muc2Nyb2xsT2Zmc2V0O1xuICAgICAgdmFyIGJvdW5kcnlfYm90dG9tICAgICAgPSB3aW5fdG9wICsgUy5kaW1zLnZwX2hlaWdodCAtIFMuc2V0dGluZ3Muc2Nyb2xsT2Zmc2V0O1xuICAgICAgdmFyIHNlY3Rpb25zX2FjdGl2ZSAgICAgPSBbXTtcbiAgICAgIHZhciBzdWJfc2VjdGlvbnNfYWN0aXZlID0gW107XG5cbiAgICAgIGlmICggd2luX3RvcCA+IChTLmRpbXMubmF2X29mZnNldCAtIFMuc2V0dGluZ3MuZml4ZWRNYXJnaW4pICkgeyAkbmF2LmFkZENsYXNzKCdmaXhlZCcpOyB9XG4gICAgICBlbHNlIHsgJG5hdi5yZW1vdmVDbGFzcygnZml4ZWQnKTsgfVxuXG4gICAgICB2YXIgaW5fdmlldyA9IGZ1bmN0aW9uKHNlY3Rpb24pIHtcbiAgICAgICAgcmV0dXJuIChzZWN0aW9uLnRvcF9vZmZzZXQgPj0gYm91bmRyeV90b3AgJiYgc2VjdGlvbi50b3Bfb2Zmc2V0IDw9IGJvdW5kcnlfYm90dG9tKSB8fCAoc2VjdGlvbi5ib3R0b21fb2Zmc2V0ID4gYm91bmRyeV90b3AgJiYgc2VjdGlvbi5ib3R0b21fb2Zmc2V0IDwgYm91bmRyeV9ib3R0b20pIHx8IChzZWN0aW9uLnRvcF9vZmZzZXQgPCBib3VuZHJ5X3RvcCAmJiBzZWN0aW9uLmJvdHRvbV9vZmZzZXQgPiBib3VuZHJ5X2JvdHRvbSk7XG4gICAgICB9O1xuXG4gICAgICAkLmVhY2goUy5zZWN0aW9ucy5kYXRhLCBmdW5jdGlvbigpIHtcbiAgICAgICAgaWYgKCBpbl92aWV3KHRoaXMpICkge1xuICAgICAgICAgIHNlY3Rpb25zX2FjdGl2ZS5wdXNoKHRoaXMpO1xuICAgICAgICB9XG4gICAgICAgICQuZWFjaCh0aGlzLnN1Yl9zZWN0aW9ucywgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgaWYgKCBpbl92aWV3KHRoaXMpICkge1xuICAgICAgICAgICAgc3ViX3NlY3Rpb25zX2FjdGl2ZS5wdXNoKHRoaXMpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICB9KTtcblxuICAgICAgJG5hdi5maW5kKCcuJyArIFMuc2V0dGluZ3MuY2xhc3NOYW1lICsgJ19faXRlbScpLnJlbW92ZUNsYXNzKCdhY3RpdmUnKS5yZW1vdmVDbGFzcygnaW4tdmlldycpO1xuICAgICAgJG5hdi5maW5kKCcuJyArIFMuc2V0dGluZ3MuY2xhc3NOYW1lICsgJ19fc3ViLWl0ZW0nKS5yZW1vdmVDbGFzcygnYWN0aXZlJykucmVtb3ZlQ2xhc3MoJ2luLXZpZXcnKTtcblxuICAgICAgJC5lYWNoKHNlY3Rpb25zX2FjdGl2ZSwgZnVuY3Rpb24oaSkge1xuICAgICAgICBpZiAoaSA9PT0gMCkge1xuICAgICAgICAgICRuYXYuZmluZCgnYVtocmVmPVwiIycgKyB0aGlzLmlkICsgJ1wiXScpLnBhcmVudHMoJy4nICsgUy5zZXR0aW5ncy5jbGFzc05hbWUgKyAnX19pdGVtJykuYWRkQ2xhc3MoJ2FjdGl2ZScpLmFkZENsYXNzKCdpbi12aWV3Jyk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgJG5hdi5maW5kKCdhW2hyZWY9XCIjJyArIHRoaXMuaWQgKyAnXCJdJykucGFyZW50cygnLicgKyBTLnNldHRpbmdzLmNsYXNzTmFtZSArICdfX2l0ZW0nKS5hZGRDbGFzcygnaW4tdmlldycpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICAgIFMuc2VjdGlvbnMuYWN0aXZlID0gc2VjdGlvbnNfYWN0aXZlO1xuXG4gICAgICAkLmVhY2goc3ViX3NlY3Rpb25zX2FjdGl2ZSwgZnVuY3Rpb24oaSkge1xuICAgICAgICBpZiAoaSA9PT0gMCkge1xuICAgICAgICAgICRuYXYuZmluZCgnYVtocmVmPVwiIycgKyB0aGlzLmlkICsgJ1wiXScpLnBhcmVudHMoJy4nICsgUy5zZXR0aW5ncy5jbGFzc05hbWUgKyAnX19zdWItaXRlbScpLmFkZENsYXNzKCdhY3RpdmUnKS5hZGRDbGFzcygnaW4tdmlldycpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICRuYXYuZmluZCgnYVtocmVmPVwiIycgKyB0aGlzLmlkICsgJ1wiXScpLnBhcmVudHMoJy4nICsgUy5zZXR0aW5ncy5jbGFzc05hbWUgKyAnX19zdWItaXRlbScpLmFkZENsYXNzKCdpbi12aWV3Jyk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0sXG4gICAgX2luaXRfc2Nyb2xsX2xpc3RlbmVyOiBmdW5jdGlvbigpIHtcbiAgICAgIC8vIFNldCBhIHNjcm9sbCBsaXN0ZW5lciB0byB1cGRhdGUgdGhlIGZpeGVkIGFuZCBhY3RpdmUgY2xhc3Nlc1xuXG4gICAgICAkKHdpbmRvdykub24oJ3Njcm9sbC5zY3JvbGxOYXYnLCBmdW5jdGlvbigpIHtcbiAgICAgICAgUy5fY2hlY2tfcG9zKCk7XG4gICAgICB9KTtcbiAgICB9LFxuICAgIF9ybV9zY3JvbGxfbGlzdGVuZXJzOiBmdW5jdGlvbigpIHtcbiAgICAgICQod2luZG93KS5vZmYoJ3Njcm9sbC5zY3JvbGxOYXYnKTtcbiAgICB9LFxuICAgIF9pbml0X3Jlc2l6ZV9saXN0ZW5lcjogZnVuY3Rpb24oKSB7XG4gICAgICAvLyBTZXQgYSByZXNpemUgbGlzdGVuZXIgdG8gdXBkYXRlIHBvc2l0aW9uIHZhbHVlcyBhbmQgdGhlIGZpeGVkIGFuZCBhY3RpdmUgY2xhc3Nlc1xuXG4gICAgICAkKHdpbmRvdykub24oJ3Jlc2l6ZS5zY3JvbGxOYXYnLCBmdW5jdGlvbigpIHtcbiAgICAgICAgUy5fc2V0dXBfcG9zKCk7XG4gICAgICAgIFMuX2NoZWNrX3BvcygpO1xuICAgICAgfSk7XG4gICAgfSxcbiAgICBfcm1fcmVzaXplX2xpc3RlbmVyOiBmdW5jdGlvbigpIHtcbiAgICAgICQod2luZG93KS5vZmYoJ3Jlc2l6ZS5zY3JvbGxOYXYnKTtcbiAgICB9LFxuICAgIF9pbml0X2NsaWNrX2xpc3RlbmVyOiBmdW5jdGlvbigpIHtcbiAgICAgIC8vIFNjcm9sbCB0byBzZWN0aW9uIG9uIGNsaWNrXG5cbiAgICAgICQoJy4nICsgUy5zZXR0aW5ncy5jbGFzc05hbWUpLmZpbmQoJ2EnKS5vbignY2xpY2suc2Nyb2xsTmF2JywgZnVuY3Rpb24oZSkge1xuICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG5cbiAgICAgICAgdmFyIHZhbHVlICAgICA9ICQodGhpcykuYXR0cignaHJlZicpO1xuICAgICAgICB2YXIgc3BlZWQgICAgID0gUy5zZXR0aW5ncy5zcGVlZDtcbiAgICAgICAgdmFyIG9mZnNldCAgICA9IFMuc2V0dGluZ3Muc2Nyb2xsT2Zmc2V0O1xuICAgICAgICB2YXIgYW5pbWF0ZWQgID0gUy5zZXR0aW5ncy5hbmltYXRlZDtcblxuICAgICAgICBzY3JvbGxfdG8odmFsdWUsIHNwZWVkLCBvZmZzZXQsIGFuaW1hdGVkKTtcbiAgICAgIH0pO1xuICAgIH0sXG4gICAgX3JtX2NsaWNrX2xpc3RlbmVyOiBmdW5jdGlvbigpIHtcbiAgICAgICQoJy4nICsgUy5zZXR0aW5ncy5jbGFzc05hbWUpLmZpbmQoJ2EnKS5vZmYoJ2NsaWNrLnNjcm9sbE5hdicpO1xuICAgIH0sXG4gICAgX2luaXRfa2V5Ym9hcmRfbGlzdGVuZXI6IGZ1bmN0aW9uKHNlY3Rpb25zKSB7XG4gICAgICAvLyBTY3JvbGwgdG8gc2VjdGlvbiBvbiBhcnJvdyBrZXkgcHJlc3NcblxuICAgICAgaWYgKFMuc2V0dGluZ3MuYXJyb3dLZXlzKSB7XG4gICAgICAgICQoZG9jdW1lbnQpLm9uKCdrZXlkb3duLnNjcm9sbE5hdicsIGZ1bmN0aW9uKGUpIHtcbiAgICAgICAgICBpZiAoZS5rZXlDb2RlID09PSA0MCB8fCBlLmtleUNvZGUgPT09IDM4KSB7XG4gICAgICAgICAgICB2YXIgZmluZFNlY3Rpb24gPSBmdW5jdGlvbihrZXkpIHtcbiAgICAgICAgICAgICAgdmFyIGkgPSAwO1xuICAgICAgICAgICAgICB2YXIgbCA9IHNlY3Rpb25zLmxlbmd0aDtcblxuICAgICAgICAgICAgICBmb3IgKGk7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgICAgICAgICBpZiAoc2VjdGlvbnNbaV0uaWQgPT09IFMuc2VjdGlvbnMuYWN0aXZlWzBdLmlkKSB7XG4gICAgICAgICAgICAgICAgICB2YXIgYXJyYXlfb2Zmc2V0ICA9IChrZXkgPT09IDQwKSA/IGkgKyAxIDogaSAtMTtcbiAgICAgICAgICAgICAgICAgIHZhciBpZCAgICAgICAgICAgID0gKHNlY3Rpb25zW2FycmF5X29mZnNldF0gPT09IHVuZGVmaW5lZCkgPyB1bmRlZmluZWQgOiBzZWN0aW9uc1thcnJheV9vZmZzZXRdLmlkO1xuXG4gICAgICAgICAgICAgICAgICByZXR1cm4gaWQ7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICB2YXIgdGFyZ2V0X3NlY3Rpb24gPSBmaW5kU2VjdGlvbihlLmtleUNvZGUpO1xuXG4gICAgICAgICAgICBpZiAodGFyZ2V0X3NlY3Rpb24gIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG5cbiAgICAgICAgICAgICAgdmFyIHZhbHVlICAgICA9ICcjJyArIHRhcmdldF9zZWN0aW9uO1xuICAgICAgICAgICAgICB2YXIgc3BlZWQgICAgID0gUy5zZXR0aW5ncy5zcGVlZDtcbiAgICAgICAgICAgICAgdmFyIG9mZnNldCAgICA9IFMuc2V0dGluZ3Muc2Nyb2xsT2Zmc2V0O1xuICAgICAgICAgICAgICB2YXIgYW5pbWF0ZWQgID0gUy5zZXR0aW5ncy5hbmltYXRlZDtcblxuICAgICAgICAgICAgICBzY3JvbGxfdG8odmFsdWUsIHNwZWVkLCBvZmZzZXQsIGFuaW1hdGVkKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH0sXG4gICAgX3JtX2tleWJvYXJkX2xpc3RlbmVyOiBmdW5jdGlvbigpIHtcbiAgICAgICQoZG9jdW1lbnQpLm9mZigna2V5ZG93bi5zY3JvbGxOYXYnKTtcbiAgICB9LFxuICAgIGluaXQ6IGZ1bmN0aW9uKG9wdGlvbnMpIHtcbiAgICAgIHJldHVybiB0aGlzLmVhY2goZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciAkZWwgPSAkKHRoaXMpO1xuXG4gICAgICAgIC8vIE1lcmdlIGRlZmF1bHQgc2V0dGluZ3Mgd2l0aCB1c2VyIGRlZmluZWQgb3B0aW9uc1xuICAgICAgICBTLnNldHRpbmdzID0gJC5leHRlbmQoe30sIFMuZGVmYXVsdHMsIG9wdGlvbnMpO1xuXG4gICAgICAgIC8vIElmIHRoZSBpbnNlcnQgdGFyZ2V0IGlzbid0IHNldCwgdXNlIHRoZSBpbml0aWFsaXplZCBlbGVtZW50XG4gICAgICAgIFMuc2V0dGluZ3MuaW5zZXJ0VGFyZ2V0ID0gUy5zZXR0aW5ncy5pbnNlcnRUYXJnZXQgPyAkKFMuc2V0dGluZ3MuaW5zZXJ0VGFyZ2V0KSA6ICRlbDtcblxuICAgICAgICBpZiAoJGVsLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAvLyBJbml0aWFsaXplXG5cbiAgICAgICAgICAvLyBGaXJlIGN1c3RvbSBpbml0IGNhbGxiYWNrXG4gICAgICAgICAgaWYgKFMuc2V0dGluZ3Mub25Jbml0KSB7IFMuc2V0dGluZ3Mub25Jbml0LmNhbGwodGhpcyk7IH1cblxuICAgICAgICAgIFMuX3NldF9ib2R5X2NsYXNzKCdsb2FkaW5nJyk7XG4gICAgICAgICAgUy5fZmluZF9zZWN0aW9ucygkZWwpO1xuXG4gICAgICAgICAgaWYgKCAkZWwuZmluZChTLnNldHRpbmdzLnNlY3Rpb25zKS5sZW5ndGggPiAwICkge1xuICAgICAgICAgICAgLy8gQlVJTEQhISEhXG5cbiAgICAgICAgICAgIFMuX3NldHVwX3NlY3Rpb25zKFMuc2VjdGlvbnMucmF3KTtcbiAgICAgICAgICAgIFMuX3NldHVwX25hdihTLnNlY3Rpb25zLmRhdGEpO1xuXG4gICAgICAgICAgICBpZiAoIFMuc2V0dGluZ3MuaW5zZXJ0VGFyZ2V0Lmxlbmd0aCA+IDAgKSB7XG4gICAgICAgICAgICAgIC8vQWRkIHRvIHBhZ2VcblxuICAgICAgICAgICAgICBTLl9pbnNlcnRfbmF2KCk7XG4gICAgICAgICAgICAgIFMuX3NldHVwX3BvcygpO1xuICAgICAgICAgICAgICBTLl9jaGVja19wb3MoKTtcbiAgICAgICAgICAgICAgUy5faW5pdF9zY3JvbGxfbGlzdGVuZXIoKTtcbiAgICAgICAgICAgICAgUy5faW5pdF9yZXNpemVfbGlzdGVuZXIoKTtcbiAgICAgICAgICAgICAgUy5faW5pdF9jbGlja19saXN0ZW5lcigpO1xuICAgICAgICAgICAgICBTLl9pbml0X2tleWJvYXJkX2xpc3RlbmVyKFMuc2VjdGlvbnMuZGF0YSk7XG4gICAgICAgICAgICAgIFMuX3NldF9ib2R5X2NsYXNzKCdzdWNjZXNzJyk7XG4gICAgICAgICAgICAgIGlmIChTLnNldHRpbmdzLnNjcm9sbFRvSGFzaCl7XG4gICAgICAgICAgICAgICAgc2Nyb2xsX3RvKCBnZXRfaGFzaCgpICk7XG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAvLyBGaXJlIGN1c3RvbSByZW5kZXIgY2FsbGJhY2tcbiAgICAgICAgICAgICAgaWYgKFMuc2V0dGluZ3Mub25SZW5kZXIpIHsgUy5zZXR0aW5ncy5vblJlbmRlci5jYWxsKHRoaXMpOyB9XG5cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIGNvbnNvbGUubG9nKCdCdWlsZCBmYWlsZWQsIHNjcm9sbE5hdiBjb3VsZCBub3QgZmluZCBcIicgKyBTLnNldHRpbmdzLmluc2VydFRhcmdldCArICdcIicpO1xuICAgICAgICAgICAgICBTLl9zZXRfYm9keV9jbGFzcygnZmFpbGVkJyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29uc29sZS5sb2coJ0J1aWxkIGZhaWxlZCwgc2Nyb2xsTmF2IGNvdWxkIG5vdCBmaW5kIGFueSBcIicgKyBTLnNldHRpbmdzLnNlY3Rpb25zICsgJ3NcIiBpbnNpZGUgb2YgXCInICsgJGVsLnNlbGVjdG9yICsgJ1wiJyk7XG4gICAgICAgICAgICBTLl9zZXRfYm9keV9jbGFzcygnZmFpbGVkJyk7XG4gICAgICAgICAgfVxuXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgY29uc29sZS5sb2coJ0J1aWxkIGZhaWxlZCwgc2Nyb2xsTmF2IGNvdWxkIG5vdCBmaW5kIFwiJyArICRlbC5zZWxlY3RvciArICdcIicpO1xuICAgICAgICAgIFMuX3NldF9ib2R5X2NsYXNzKCdmYWlsZWQnKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfSxcbiAgICBkZXN0cm95OiBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiB0aGlzLmVhY2goZnVuY3Rpb24oKSB7XG5cbiAgICAgICAgLy8gVW5iaW5kIGV2ZW50IGxpc3RlbmVyc1xuICAgICAgICBTLl9ybV9zY3JvbGxfbGlzdGVuZXJzKCk7XG4gICAgICAgIFMuX3JtX3Jlc2l6ZV9saXN0ZW5lcigpO1xuICAgICAgICBTLl9ybV9jbGlja19saXN0ZW5lcigpO1xuICAgICAgICBTLl9ybV9rZXlib2FyZF9saXN0ZW5lcigpO1xuXG4gICAgICAgIC8vIFJlbW92ZSBhbnkgb2YgdGhlIGxvYWRpbmcgaG9va3NcbiAgICAgICAgJCgnYm9keScpLnJlbW92ZUNsYXNzKCdzbi1sb2FkaW5nIHNuLWFjdGl2ZSBzbi1mYWlsZWQnKTtcblxuICAgICAgICAvLyBSZW1vdmUgdGhlIG5hdiBmcm9tIHRoZSBkb21cbiAgICAgICAgJCgnLicgKyBTLnNldHRpbmdzLmNsYXNzTmFtZSkucmVtb3ZlKCk7XG5cbiAgICAgICAgLy8gVGVhcmRvd24gc2VjdGlvbnNcbiAgICAgICAgUy5fdGVhcl9kb3duX3NlY3Rpb25zKFMuc2VjdGlvbnMuZGF0YSk7XG5cbiAgICAgICAgLy8gRmlyZSBjdXN0b20gZGVzdHJveSBjYWxsYmFja1xuICAgICAgICBpZiAoUy5zZXR0aW5ncy5vbkRlc3Ryb3kpIHsgUy5zZXR0aW5ncy5vbkRlc3Ryb3kuY2FsbCh0aGlzKTsgfVxuXG4gICAgICAgIC8vIFJlbW92ZSB0aGUgc2F2ZWQgc2V0dGluZ3NcbiAgICAgICAgUy5zZXR0aW5ncyA9IFtdO1xuICAgICAgICBTLnNlY3Rpb25zID0gdW5kZWZpbmVkO1xuICAgICAgfSk7XG4gICAgfSxcbiAgICByZXNldFBvczogZnVuY3Rpb24oKSB7XG4gICAgICBTLl9zZXR1cF9wb3MoKTtcbiAgICAgIFMuX2NoZWNrX3BvcygpO1xuXG4gICAgICAvLyBGaXJlIGN1c3RvbSByZXNldCBwb3NpdGlvbiBjYWxsYmFja1xuICAgICAgaWYgKFMuc2V0dGluZ3Mub25SZXNldFBvcykgeyBTLnNldHRpbmdzLm9uUmVzZXRQb3MuY2FsbCh0aGlzKTsgfVxuICAgIH1cbiAgfTtcblxuICAkLmZuLnNjcm9sbE5hdiA9IGZ1bmN0aW9uKCkge1xuICAgIHZhciBvcHRpb25zO1xuICAgIHZhciBtZXRob2QgID0gYXJndW1lbnRzWzBdO1xuXG4gICAgaWYgKFNbbWV0aG9kXSkge1xuICAgICAgLy8gTWV0aG9kIGV4aXN0cywgc28gdXNlIGl0XG5cbiAgICAgIG1ldGhvZCAgPSBTW21ldGhvZF07XG4gICAgICBvcHRpb25zID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZihtZXRob2QpID09PSAnb2JqZWN0JyB8fCAhbWV0aG9kKSB7XG4gICAgICAvLyBObyBtZXRob2QgcGFzc2VkLCBkZWZhdWx0IHRvIGluaXRcblxuICAgICAgbWV0aG9kICA9IFMuaW5pdDtcbiAgICAgIG9wdGlvbnMgPSBhcmd1bWVudHM7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIE1ldGhvZCBkb2Vzbid0IGV4aXN0XG5cbiAgICAgICQuZXJyb3IoICdNZXRob2QgJyArICBtZXRob2QgKyAnIGRvZXMgbm90IGV4aXN0IGluIHRoZSBzY3JvbGxOYXYgcGx1Z2luJyApO1xuICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgcmV0dXJuIG1ldGhvZC5hcHBseSh0aGlzLCBvcHRpb25zKTtcbiAgfTtcbn0pKGpRdWVyeSk7XG4iXX0=
