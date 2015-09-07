/*

Tooltipster 3.3.0 | 2014-11-08
A rockin' custom tooltip jQuery plugin

Developed by Caleb Jacob under the MIT license http://opensource.org/licenses/MIT

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

*/

'use strict';

;(function ($, window, document) {

	var pluginName = "tooltipster",
	    defaults = {
		animation: 'fade',
		arrow: true,
		arrowColor: '',
		autoClose: true,
		content: null,
		contentAsHTML: false,
		contentCloning: true,
		debug: true,
		delay: 200,
		minWidth: 0,
		maxWidth: null,
		functionInit: function functionInit(origin, content) {},
		functionBefore: function functionBefore(origin, continueTooltip) {
			continueTooltip();
		},
		functionReady: function functionReady(origin, tooltip) {},
		functionAfter: function functionAfter(origin) {},
		hideOnClick: false,
		icon: '(?)',
		iconCloning: true,
		iconDesktop: false,
		iconTouch: false,
		iconTheme: 'tooltipster-icon',
		interactive: false,
		interactiveTolerance: 350,
		multiple: false,
		offsetX: 0,
		offsetY: 0,
		onlyOne: false,
		position: 'top',
		positionTracker: false,
		positionTrackerCallback: function positionTrackerCallback(origin) {
			// the default tracker callback will close the tooltip when the trigger is
			// 'hover' (see https://github.com/iamceege/tooltipster/pull/253)
			if (this.option('trigger') == 'hover' && this.option('autoClose')) {
				this.hide();
			}
		},
		restoration: 'current',
		speed: 350,
		timer: 0,
		theme: 'tooltipster-default',
		touchDevices: true,
		trigger: 'hover',
		updateAnimation: true
	};

	function Plugin(element, options) {

		// list of instance variables

		this.bodyOverflowX;
		// stack of custom callbacks provided as parameters to API methods
		this.callbacks = {
			hide: [],
			show: []
		};
		this.checkInterval = null;
		// this will be the user content shown in the tooltip. A capital "C" is used because there is also a method called content()
		this.Content;
		// this is the original element which is being applied the tooltipster plugin
		this.$el = $(element);
		// this will be the element which triggers the appearance of the tooltip on hover/click/custom events.
		// it will be the same as this.$el if icons are not used (see in the options), otherwise it will correspond to the created icon
		this.$elProxy;
		this.elProxyPosition;
		this.enabled = true;
		this.options = $.extend({}, defaults, options);
		this.mouseIsOverProxy = false;
		// a unique namespace per instance, for easy selective unbinding
		this.namespace = 'tooltipster-' + Math.round(Math.random() * 100000);
		// Status (capital S) can be either : appearing, shown, disappearing, hidden
		this.Status = 'hidden';
		this.timerHide = null;
		this.timerShow = null;
		// this will be the tooltip element (jQuery wrapped HTML element)
		this.$tooltip;

		// for backward compatibility
		this.options.iconTheme = this.options.iconTheme.replace('.', '');
		this.options.theme = this.options.theme.replace('.', '');

		// launch

		this._init();
	}

	Plugin.prototype = {

		_init: function _init() {

			var self = this;

			// disable the plugin on old browsers (including IE7 and lower)
			if (document.querySelector) {

				// note : the content is null (empty) by default and can stay that way if the plugin remains initialized but not fed any content. The tooltip will just not appear.

				// let's save the initial value of the title attribute for later restoration if need be.
				var initialTitle = null;
				// it will already have been saved in case of multiple tooltips
				if (self.$el.data('tooltipster-initialTitle') === undefined) {

					initialTitle = self.$el.attr('title');

					// we do not want initialTitle to have the value "undefined" because of how jQuery's .data() method works
					if (initialTitle === undefined) initialTitle = null;

					self.$el.data('tooltipster-initialTitle', initialTitle);
				}

				// if content is provided in the options, its has precedence over the title attribute.
				// Note : an empty string is considered content, only 'null' represents the absence of content.
				// Also, an existing title="" attribute will result in an empty string content
				if (self.options.content !== null) {
					self._content_set(self.options.content);
				} else {
					self._content_set(initialTitle);
				}

				var c = self.options.functionInit.call(self.$el, self.$el, self.Content);
				if (typeof c !== 'undefined') self._content_set(c);

				self.$el
				// strip the title off of the element to prevent the default tooltips from popping up
				.removeAttr('title')
				// to be able to find all instances on the page later (upon window events in particular)
				.addClass('tooltipstered');

				// detect if we're changing the tooltip origin to an icon
				// note about this condition : if the device has touch capability and self.options.iconTouch is false, you'll have no icons event though you may consider your device as a desktop if it also has a mouse. Not sure why someone would have this use case though.
				if (!deviceHasTouchCapability && self.options.iconDesktop || deviceHasTouchCapability && self.options.iconTouch) {

					// TODO : the tooltip should be automatically be given an absolute position to be near the origin. Otherwise, when the origin is floating or what, it's going to be nowhere near it and disturb the position flow of the page elements. It will imply that the icon also detects when its origin moves, to follow it : not trivial.
					// Until it's done, the icon feature does not really make sense since the user still has most of the work to do by himself

					// if the icon provided is in the form of a string
					if (typeof self.options.icon === 'string') {
						// wrap it in a span with the icon class
						self.$elProxy = $('<span class="' + self.options.iconTheme + '"></span>');
						self.$elProxy.text(self.options.icon);
					}
					// if it is an object (sensible choice)
					else {
							// (deep) clone the object if iconCloning == true, to make sure every instance has its own proxy. We use the icon without wrapping, no need to. We do not give it a class either, as the user will undoubtedly style the object on his own and since our css properties may conflict with his own
							if (self.options.iconCloning) self.$elProxy = self.options.icon.clone(true);else self.$elProxy = self.options.icon;
						}

					self.$elProxy.insertAfter(self.$el);
				} else {
					self.$elProxy = self.$el;
				}

				// for 'click' and 'hover' triggers : bind on events to open the tooltip. Closing is now handled in _showNow() because of its bindings.
				// Notes about touch events :
				// - mouseenter, mouseleave and clicks happen even on pure touch devices because they are emulated. deviceIsPureTouch() is a simple attempt to detect them.
				// - on hybrid devices, we do not prevent touch gesture from opening tooltips. It would be too complex to differentiate real mouse events from emulated ones.
				// - we check deviceIsPureTouch() at each event rather than prior to binding because the situation may change during browsing
				if (self.options.trigger == 'hover') {

					// these binding are for mouse interaction only
					self.$elProxy.on('mouseenter.' + self.namespace, function () {
						if (!deviceIsPureTouch() || self.options.touchDevices) {
							self.mouseIsOverProxy = true;
							self._show();
						}
					}).on('mouseleave.' + self.namespace, function () {
						if (!deviceIsPureTouch() || self.options.touchDevices) {
							self.mouseIsOverProxy = false;
						}
					});

					// for touch interaction only
					if (deviceHasTouchCapability && self.options.touchDevices) {

						// for touch devices, we immediately display the tooltip because we cannot rely on mouseleave to handle the delay
						self.$elProxy.on('touchstart.' + self.namespace, function () {
							self._showNow();
						});
					}
				} else if (self.options.trigger == 'click') {

					// note : for touch devices, we do not bind on touchstart, we only rely on the emulated clicks (triggered by taps)
					self.$elProxy.on('click.' + self.namespace, function () {
						if (!deviceIsPureTouch() || self.options.touchDevices) {
							self._show();
						}
					});
				}
			}
		},

		// this function will schedule the opening of the tooltip after the delay, if there is one
		_show: function _show() {

			var self = this;

			if (self.Status != 'shown' && self.Status != 'appearing') {

				if (self.options.delay) {
					self.timerShow = setTimeout(function () {

						// for hover trigger, we check if the mouse is still over the proxy, otherwise we do not show anything
						if (self.options.trigger == 'click' || self.options.trigger == 'hover' && self.mouseIsOverProxy) {
							self._showNow();
						}
					}, self.options.delay);
				} else self._showNow();
			}
		},

		// this function will open the tooltip right away
		_showNow: function _showNow(callback) {

			var self = this;

			// call our constructor custom function before continuing
			self.options.functionBefore.call(self.$el, self.$el, function () {

				// continue only if the tooltip is enabled and has any content
				if (self.enabled && self.Content !== null) {

					// save the method callback and cancel hide method callbacks
					if (callback) self.callbacks.show.push(callback);
					self.callbacks.hide = [];

					//get rid of any appearance timer
					clearTimeout(self.timerShow);
					self.timerShow = null;
					clearTimeout(self.timerHide);
					self.timerHide = null;

					// if we only want one tooltip open at a time, close all auto-closing tooltips currently open and not already disappearing
					if (self.options.onlyOne) {
						$('.tooltipstered').not(self.$el).each(function (i, el) {

							var $el = $(el),
							    nss = $el.data('tooltipster-ns');

							// iterate on all tooltips of the element
							$.each(nss, function (i, ns) {
								var instance = $el.data(ns),

								// we have to use the public methods here
								s = instance.status(),
								    ac = instance.option('autoClose');

								if (s !== 'hidden' && s !== 'disappearing' && ac) {
									instance.hide();
								}
							});
						});
					}

					var finish = function finish() {
						self.Status = 'shown';

						// trigger any show method custom callbacks and reset them
						$.each(self.callbacks.show, function (i, c) {
							c.call(self.$el);
						});
						self.callbacks.show = [];
					};

					// if this origin already has its tooltip open
					if (self.Status !== 'hidden') {

						// the timer (if any) will start (or restart) right now
						var extraTime = 0;

						// if it was disappearing, cancel that
						if (self.Status === 'disappearing') {

							self.Status = 'appearing';

							if (supportsTransitions()) {

								self.$tooltip.clearQueue().removeClass('tooltipster-dying').addClass('tooltipster-' + self.options.animation + '-show');

								if (self.options.speed > 0) self.$tooltip.delay(self.options.speed);

								self.$tooltip.queue(finish);
							} else {
								// in case the tooltip was currently fading out, bring it back to life
								self.$tooltip.stop().fadeIn(finish);
							}
						}
						// if the tooltip is already open, we still need to trigger the method custom callback
						else if (self.Status === 'shown') {
								finish();
							}
					}
					// if the tooltip isn't already open, open that sucker up!
					else {

							self.Status = 'appearing';

							// the timer (if any) will start when the tooltip has fully appeared after its transition
							var extraTime = self.options.speed;

							// disable horizontal scrollbar to keep overflowing tooltips from jacking with it and then restore it to its previous value
							self.bodyOverflowX = $('body').css('overflow-x');
							$('body').css('overflow-x', 'hidden');

							// get some other settings related to building the tooltip
							var animation = 'tooltipster-' + self.options.animation,
							    animationSpeed = '-webkit-transition-duration: ' + self.options.speed + 'ms; -webkit-animation-duration: ' + self.options.speed + 'ms; -moz-transition-duration: ' + self.options.speed + 'ms; -moz-animation-duration: ' + self.options.speed + 'ms; -o-transition-duration: ' + self.options.speed + 'ms; -o-animation-duration: ' + self.options.speed + 'ms; -ms-transition-duration: ' + self.options.speed + 'ms; -ms-animation-duration: ' + self.options.speed + 'ms; transition-duration: ' + self.options.speed + 'ms; animation-duration: ' + self.options.speed + 'ms;',
							    minWidth = self.options.minWidth ? 'min-width:' + Math.round(self.options.minWidth) + 'px;' : '',
							    maxWidth = self.options.maxWidth ? 'max-width:' + Math.round(self.options.maxWidth) + 'px;' : '',
							    pointerEvents = self.options.interactive ? 'pointer-events: auto;' : '';

							// build the base of our tooltip
							self.$tooltip = $('<div class="tooltipster-base ' + self.options.theme + '" style="' + minWidth + ' ' + maxWidth + ' ' + pointerEvents + ' ' + animationSpeed + '"><div class="tooltipster-content"></div></div>');

							// only add the animation class if the user has a browser that supports animations
							if (supportsTransitions()) self.$tooltip.addClass(animation);

							// insert the content
							self._content_insert();

							// attach
							self.$tooltip.appendTo('body');

							// do all the crazy calculations and positioning
							self.reposition();

							// call our custom callback since the content of the tooltip is now part of the DOM
							self.options.functionReady.call(self.$el, self.$el, self.$tooltip);

							// animate in the tooltip
							if (supportsTransitions()) {

								self.$tooltip.addClass(animation + '-show');

								if (self.options.speed > 0) self.$tooltip.delay(self.options.speed);

								self.$tooltip.queue(finish);
							} else {
								self.$tooltip.css('display', 'none').fadeIn(self.options.speed, finish);
							}

							// will check if our tooltip origin is removed while the tooltip is shown
							self._interval_set();

							// reposition on scroll (otherwise position:fixed element's tooltips will move away form their origin) and on resize (in case position can/has to be changed)
							$(window).on('scroll.' + self.namespace + ' resize.' + self.namespace, function () {
								self.reposition();
							});

							// auto-close bindings
							if (self.options.autoClose) {

								// in case a listener is already bound for autoclosing (mouse or touch, hover or click), unbind it first
								$('body').off('.' + self.namespace);

								// here we'll have to set different sets of bindings for both touch and mouse
								if (self.options.trigger == 'hover') {

									// if the user touches the body, hide
									if (deviceHasTouchCapability) {
										// timeout 0 : explanation below in click section
										setTimeout(function () {
											// we don't want to bind on click here because the initial touchstart event has not yet triggered its click event, which is thus about to happen
											$('body').on('touchstart.' + self.namespace, function () {
												self.hide();
											});
										}, 0);
									}

									// if we have to allow interaction
									if (self.options.interactive) {

										// touch events inside the tooltip must not close it
										if (deviceHasTouchCapability) {
											self.$tooltip.on('touchstart.' + self.namespace, function (event) {
												event.stopPropagation();
											});
										}

										// as for mouse interaction, we get rid of the tooltip only after the mouse has spent some time out of it
										var tolerance = null;

										self.$elProxy.add(self.$tooltip)
										// hide after some time out of the proxy and the tooltip
										.on('mouseleave.' + self.namespace + '-autoClose', function () {
											clearTimeout(tolerance);
											tolerance = setTimeout(function () {
												self.hide();
											}, self.options.interactiveTolerance);
										})
										// suspend timeout when the mouse is over the proxy or the tooltip
										.on('mouseenter.' + self.namespace + '-autoClose', function () {
											clearTimeout(tolerance);
										});
									}
									// if this is a non-interactive tooltip, get rid of it if the mouse leaves
									else {
											self.$elProxy.on('mouseleave.' + self.namespace + '-autoClose', function () {
												self.hide();
											});
										}

									// close the tooltip when the proxy gets a click (common behavior of native tooltips)
									if (self.options.hideOnClick) {

										self.$elProxy.on('click.' + self.namespace + '-autoClose', function () {
											self.hide();
										});
									}
								}
								// here we'll set the same bindings for both clicks and touch on the body to hide the tooltip
								else if (self.options.trigger == 'click') {

										// use a timeout to prevent immediate closing if the method was called on a click event and if options.delay == 0 (because of bubbling)
										setTimeout(function () {
											$('body').on('click.' + self.namespace + ' touchstart.' + self.namespace, function () {
												self.hide();
											});
										}, 0);

										// if interactive, we'll stop the events that were emitted from inside the tooltip to stop autoClosing
										if (self.options.interactive) {

											// note : the touch events will just not be used if the plugin is not enabled on touch devices
											self.$tooltip.on('click.' + self.namespace + ' touchstart.' + self.namespace, function (event) {
												event.stopPropagation();
											});
										}
									}
							}
						}

					// if we have a timer set, let the countdown begin
					if (self.options.timer > 0) {

						self.timerHide = setTimeout(function () {
							self.timerHide = null;
							self.hide();
						}, self.options.timer + extraTime);
					}
				}
			});
		},

		_interval_set: function _interval_set() {

			var self = this;

			self.checkInterval = setInterval(function () {

				// if the tooltip and/or its interval should be stopped
				if (
				// if the origin has been removed
				$('body').find(self.$el).length === 0
				// if the elProxy has been removed
				 || $('body').find(self.$elProxy).length === 0
				// if the tooltip has been closed
				 || self.Status == 'hidden'
				// if the tooltip has somehow been removed
				 || $('body').find(self.$tooltip).length === 0) {
					// remove the tooltip if it's still here
					if (self.Status == 'shown' || self.Status == 'appearing') self.hide();

					// clear this interval as it is no longer necessary
					self._interval_cancel();
				}
				// if everything is alright
				else {
						// compare the former and current positions of the elProxy to reposition the tooltip if need be
						if (self.options.positionTracker) {

							var p = self._repositionInfo(self.$elProxy),
							    identical = false;

							// compare size first (a change requires repositioning too)
							if (areEqual(p.dimension, self.elProxyPosition.dimension)) {

								// for elements with a fixed position, we track the top and left properties (relative to window)
								if (self.$elProxy.css('position') === 'fixed') {
									if (areEqual(p.position, self.elProxyPosition.position)) identical = true;
								}
								// otherwise, track total offset (relative to document)
								else {
										if (areEqual(p.offset, self.elProxyPosition.offset)) identical = true;
									}
							}

							if (!identical) {
								self.reposition();
								self.options.positionTrackerCallback.call(self, self.$el);
							}
						}
					}
			}, 200);
		},

		_interval_cancel: function _interval_cancel() {
			clearInterval(this.checkInterval);
			// clean delete
			this.checkInterval = null;
		},

		_content_set: function _content_set(content) {
			// clone if asked. Cloning the object makes sure that each instance has its own version of the content (in case a same object were provided for several instances)
			// reminder : typeof null === object
			if (typeof content === 'object' && content !== null && this.options.contentCloning) {
				content = content.clone(true);
			}
			this.Content = content;
		},

		_content_insert: function _content_insert() {

			var self = this,
			    $d = this.$tooltip.find('.tooltipster-content');

			if (typeof self.Content === 'string' && !self.options.contentAsHTML) {
				$d.text(self.Content);
			} else {
				$d.empty().append(self.Content);
			}
		},

		_update: function _update(content) {

			var self = this;

			// change the content
			self._content_set(content);

			if (self.Content !== null) {

				// update the tooltip if it is open
				if (self.Status !== 'hidden') {

					// reset the content in the tooltip
					self._content_insert();

					// reposition and resize the tooltip
					self.reposition();

					// if we want to play a little animation showing the content changed
					if (self.options.updateAnimation) {

						if (supportsTransitions()) {

							self.$tooltip.css({
								'width': '',
								'-webkit-transition': 'all ' + self.options.speed + 'ms, width 0ms, height 0ms, left 0ms, top 0ms',
								'-moz-transition': 'all ' + self.options.speed + 'ms, width 0ms, height 0ms, left 0ms, top 0ms',
								'-o-transition': 'all ' + self.options.speed + 'ms, width 0ms, height 0ms, left 0ms, top 0ms',
								'-ms-transition': 'all ' + self.options.speed + 'ms, width 0ms, height 0ms, left 0ms, top 0ms',
								'transition': 'all ' + self.options.speed + 'ms, width 0ms, height 0ms, left 0ms, top 0ms'
							}).addClass('tooltipster-content-changing');

							// reset the CSS transitions and finish the change animation
							setTimeout(function () {

								if (self.Status != 'hidden') {

									self.$tooltip.removeClass('tooltipster-content-changing');

									// after the changing animation has completed, reset the CSS transitions
									setTimeout(function () {

										if (self.Status !== 'hidden') {
											self.$tooltip.css({
												'-webkit-transition': self.options.speed + 'ms',
												'-moz-transition': self.options.speed + 'ms',
												'-o-transition': self.options.speed + 'ms',
												'-ms-transition': self.options.speed + 'ms',
												'transition': self.options.speed + 'ms'
											});
										}
									}, self.options.speed);
								}
							}, self.options.speed);
						} else {
							self.$tooltip.fadeTo(self.options.speed, 0.5, function () {
								if (self.Status != 'hidden') {
									self.$tooltip.fadeTo(self.options.speed, 1);
								}
							});
						}
					}
				}
			} else {
				self.hide();
			}
		},

		_repositionInfo: function _repositionInfo($el) {
			return {
				dimension: {
					height: $el.outerHeight(false),
					width: $el.outerWidth(false)
				},
				offset: $el.offset(),
				position: {
					left: parseInt($el.css('left')),
					top: parseInt($el.css('top'))
				}
			};
		},

		hide: function hide(callback) {

			var self = this;

			// save the method custom callback and cancel any show method custom callbacks
			if (callback) self.callbacks.hide.push(callback);
			self.callbacks.show = [];

			// get rid of any appearance timeout
			clearTimeout(self.timerShow);
			self.timerShow = null;
			clearTimeout(self.timerHide);
			self.timerHide = null;

			var finishCallbacks = function finishCallbacks() {
				// trigger any hide method custom callbacks and reset them
				$.each(self.callbacks.hide, function (i, c) {
					c.call(self.$el);
				});
				self.callbacks.hide = [];
			};

			// hide
			if (self.Status == 'shown' || self.Status == 'appearing') {

				self.Status = 'disappearing';

				var finish = function finish() {

					self.Status = 'hidden';

					// detach our content object first, so the next jQuery's remove() call does not unbind its event handlers
					if (typeof self.Content == 'object' && self.Content !== null) {
						self.Content.detach();
					}

					self.$tooltip.remove();
					self.$tooltip = null;

					// unbind orientationchange, scroll and resize listeners
					$(window).off('.' + self.namespace);

					$('body')
					// unbind any auto-closing click/touch listeners
					.off('.' + self.namespace).css('overflow-x', self.bodyOverflowX);

					// unbind any auto-closing click/touch listeners
					$('body').off('.' + self.namespace);

					// unbind any auto-closing hover listeners
					self.$elProxy.off('.' + self.namespace + '-autoClose');

					// call our constructor custom callback function
					self.options.functionAfter.call(self.$el, self.$el);

					// call our method custom callbacks functions
					finishCallbacks();
				};

				if (supportsTransitions()) {

					self.$tooltip.clearQueue().removeClass('tooltipster-' + self.options.animation + '-show')
					// for transitions only
					.addClass('tooltipster-dying');

					if (self.options.speed > 0) self.$tooltip.delay(self.options.speed);

					self.$tooltip.queue(finish);
				} else {
					self.$tooltip.stop().fadeOut(self.options.speed, finish);
				}
			}
			// if the tooltip is already hidden, we still need to trigger the method custom callback
			else if (self.Status == 'hidden') {
					finishCallbacks();
				}

			return self;
		},

		// the public show() method is actually an alias for the private showNow() method
		show: function show(callback) {
			this._showNow(callback);
			return this;
		},

		// 'update' is deprecated in favor of 'content' but is kept for backward compatibility
		update: function update(c) {
			return this.content(c);
		},
		content: function content(c) {
			// getter method
			if (typeof c === 'undefined') {
				return this.Content;
			}
			// setter method
			else {
					this._update(c);
					return this;
				}
		},

		reposition: function reposition() {

			var self = this;

			// in case the tooltip has been removed from DOM manually
			if ($('body').find(self.$tooltip).length !== 0) {

				// a function to detect if the tooltip is going off the screen horizontally. If so, reposition the crap out of it!

				var dontGoOffScreenX = function dontGoOffScreenX() {

					var windowLeft = $(window).scrollLeft();

					// if the tooltip goes off the left side of the screen, line it up with the left side of the window
					if (myLeft - windowLeft < 0) {
						arrowReposition = myLeft - windowLeft;
						myLeft = windowLeft;
					}

					// if the tooltip goes off the right of the screen, line it up with the right side of the window
					if (myLeft + tooltipWidth - windowLeft > windowWidth) {
						arrowReposition = myLeft - (windowWidth + windowLeft - tooltipWidth);
						myLeft = windowWidth + windowLeft - tooltipWidth;
					}
				}

				// a function to detect if the tooltip is going off the screen vertically. If so, switch to the opposite!
				;

				var dontGoOffScreenY = function dontGoOffScreenY(switchTo, switchFrom) {
					// if it goes off the top off the page
					if (proxy.offset.top - $(window).scrollTop() - tooltipHeight - offsetY - 12 < 0 && switchFrom.indexOf('top') > -1) {
						practicalPosition = switchTo;
					}

					// if it goes off the bottom of the page
					if (proxy.offset.top + proxy.dimension.height + tooltipHeight + 12 + offsetY > $(window).scrollTop() + $(window).height() && switchFrom.indexOf('bottom') > -1) {
						practicalPosition = switchTo;
						myTop = proxy.offset.top - tooltipHeight - offsetY - 12;
					}
				};

				// reset width
				self.$tooltip.css('width', '');

				// find variables to determine placement
				self.elProxyPosition = self._repositionInfo(self.$elProxy);
				var arrowReposition = null,
				    windowWidth = $(window).width(),

				// shorthand
				proxy = self.elProxyPosition,
				    tooltipWidth = self.$tooltip.outerWidth(false),
				    tooltipInnerWidth = self.$tooltip.innerWidth() + 1,
				    // this +1 stops FireFox from sometimes forcing an additional text line
				tooltipHeight = self.$tooltip.outerHeight(false);

				// if this is an <area> tag inside a <map>, all hell breaks loose. Recalculate all the measurements based on coordinates
				if (self.$elProxy.is('area')) {
					var areaShape = self.$elProxy.attr('shape'),
					    mapName = self.$elProxy.parent().attr('name'),
					    map = $('img[usemap="#' + mapName + '"]'),
					    mapOffsetLeft = map.offset().left,
					    mapOffsetTop = map.offset().top,
					    areaMeasurements = self.$elProxy.attr('coords') !== undefined ? self.$elProxy.attr('coords').split(',') : undefined;

					if (areaShape == 'circle') {
						var areaLeft = parseInt(areaMeasurements[0]),
						    areaTop = parseInt(areaMeasurements[1]),
						    areaWidth = parseInt(areaMeasurements[2]);
						proxy.dimension.height = areaWidth * 2;
						proxy.dimension.width = areaWidth * 2;
						proxy.offset.top = mapOffsetTop + areaTop - areaWidth;
						proxy.offset.left = mapOffsetLeft + areaLeft - areaWidth;
					} else if (areaShape == 'rect') {
						var areaLeft = parseInt(areaMeasurements[0]),
						    areaTop = parseInt(areaMeasurements[1]),
						    areaRight = parseInt(areaMeasurements[2]),
						    areaBottom = parseInt(areaMeasurements[3]);
						proxy.dimension.height = areaBottom - areaTop;
						proxy.dimension.width = areaRight - areaLeft;
						proxy.offset.top = mapOffsetTop + areaTop;
						proxy.offset.left = mapOffsetLeft + areaLeft;
					} else if (areaShape == 'poly') {
						var areaXs = [],
						    areaYs = [],
						    areaSmallestX = 0,
						    areaSmallestY = 0,
						    areaGreatestX = 0,
						    areaGreatestY = 0,
						    arrayAlternate = 'even';

						for (var i = 0; i < areaMeasurements.length; i++) {
							var areaNumber = parseInt(areaMeasurements[i]);

							if (arrayAlternate == 'even') {
								if (areaNumber > areaGreatestX) {
									areaGreatestX = areaNumber;
									if (i === 0) {
										areaSmallestX = areaGreatestX;
									}
								}

								if (areaNumber < areaSmallestX) {
									areaSmallestX = areaNumber;
								}

								arrayAlternate = 'odd';
							} else {
								if (areaNumber > areaGreatestY) {
									areaGreatestY = areaNumber;
									if (i == 1) {
										areaSmallestY = areaGreatestY;
									}
								}

								if (areaNumber < areaSmallestY) {
									areaSmallestY = areaNumber;
								}

								arrayAlternate = 'even';
							}
						}

						proxy.dimension.height = areaGreatestY - areaSmallestY;
						proxy.dimension.width = areaGreatestX - areaSmallestX;
						proxy.offset.top = mapOffsetTop + areaSmallestY;
						proxy.offset.left = mapOffsetLeft + areaSmallestX;
					} else {
						proxy.dimension.height = map.outerHeight(false);
						proxy.dimension.width = map.outerWidth(false);
						proxy.offset.top = mapOffsetTop;
						proxy.offset.left = mapOffsetLeft;
					}
				}

				// our function and global vars for positioning our tooltip
				var myLeft = 0,
				    myLeftMirror = 0,
				    myTop = 0,
				    offsetY = parseInt(self.options.offsetY),
				    offsetX = parseInt(self.options.offsetX),

				// this is the arrow position that will eventually be used. It may differ from the position option if the tooltip cannot be displayed in this position
				practicalPosition = self.options.position;

				if (practicalPosition == 'top') {
					var leftDifference = proxy.offset.left + tooltipWidth - (proxy.offset.left + proxy.dimension.width);
					myLeft = proxy.offset.left + offsetX - leftDifference / 2;
					myTop = proxy.offset.top - tooltipHeight - offsetY - 12;
					dontGoOffScreenX();
					dontGoOffScreenY('bottom', 'top');
				}

				if (practicalPosition == 'top-left') {
					myLeft = proxy.offset.left + offsetX;
					myTop = proxy.offset.top - tooltipHeight - offsetY - 12;
					dontGoOffScreenX();
					dontGoOffScreenY('bottom-left', 'top-left');
				}

				if (practicalPosition == 'top-right') {
					myLeft = proxy.offset.left + proxy.dimension.width + offsetX - tooltipWidth;
					myTop = proxy.offset.top - tooltipHeight - offsetY - 12;
					dontGoOffScreenX();
					dontGoOffScreenY('bottom-right', 'top-right');
				}

				if (practicalPosition == 'bottom') {
					var leftDifference = proxy.offset.left + tooltipWidth - (proxy.offset.left + proxy.dimension.width);
					myLeft = proxy.offset.left - leftDifference / 2 + offsetX;
					myTop = proxy.offset.top + proxy.dimension.height + offsetY + 12;
					dontGoOffScreenX();
					dontGoOffScreenY('top', 'bottom');
				}

				if (practicalPosition == 'bottom-left') {
					myLeft = proxy.offset.left + offsetX;
					myTop = proxy.offset.top + proxy.dimension.height + offsetY + 12;
					dontGoOffScreenX();
					dontGoOffScreenY('top-left', 'bottom-left');
				}

				if (practicalPosition == 'bottom-right') {
					myLeft = proxy.offset.left + proxy.dimension.width + offsetX - tooltipWidth;
					myTop = proxy.offset.top + proxy.dimension.height + offsetY + 12;
					dontGoOffScreenX();
					dontGoOffScreenY('top-right', 'bottom-right');
				}

				if (practicalPosition == 'left') {
					myLeft = proxy.offset.left - offsetX - tooltipWidth - 12;
					myLeftMirror = proxy.offset.left + offsetX + proxy.dimension.width + 12;
					var topDifference = proxy.offset.top + tooltipHeight - (proxy.offset.top + proxy.dimension.height);
					myTop = proxy.offset.top - topDifference / 2 - offsetY;

					// if the tooltip goes off boths sides of the page
					if (myLeft < 0 && myLeftMirror + tooltipWidth > windowWidth) {
						var borderWidth = parseFloat(self.$tooltip.css('border-width')) * 2,
						    newWidth = tooltipWidth + myLeft - borderWidth;
						self.$tooltip.css('width', newWidth + 'px');

						tooltipHeight = self.$tooltip.outerHeight(false);
						myLeft = proxy.offset.left - offsetX - newWidth - 12 - borderWidth;
						topDifference = proxy.offset.top + tooltipHeight - (proxy.offset.top + proxy.dimension.height);
						myTop = proxy.offset.top - topDifference / 2 - offsetY;
					}

					// if it only goes off one side, flip it to the other side
					else if (myLeft < 0) {
							myLeft = proxy.offset.left + offsetX + proxy.dimension.width + 12;
							arrowReposition = 'left';
						}
				}

				if (practicalPosition == 'right') {
					myLeft = proxy.offset.left + offsetX + proxy.dimension.width + 12;
					myLeftMirror = proxy.offset.left - offsetX - tooltipWidth - 12;
					var topDifference = proxy.offset.top + tooltipHeight - (proxy.offset.top + proxy.dimension.height);
					myTop = proxy.offset.top - topDifference / 2 - offsetY;

					// if the tooltip goes off boths sides of the page
					if (myLeft + tooltipWidth > windowWidth && myLeftMirror < 0) {
						var borderWidth = parseFloat(self.$tooltip.css('border-width')) * 2,
						    newWidth = windowWidth - myLeft - borderWidth;
						self.$tooltip.css('width', newWidth + 'px');

						tooltipHeight = self.$tooltip.outerHeight(false);
						topDifference = proxy.offset.top + tooltipHeight - (proxy.offset.top + proxy.dimension.height);
						myTop = proxy.offset.top - topDifference / 2 - offsetY;
					}

					// if it only goes off one side, flip it to the other side
					else if (myLeft + tooltipWidth > windowWidth) {
							myLeft = proxy.offset.left - offsetX - tooltipWidth - 12;
							arrowReposition = 'right';
						}
				}

				// if arrow is set true, style it and append it
				if (self.options.arrow) {

					var arrowClass = 'tooltipster-arrow-' + practicalPosition;

					// set color of the arrow
					if (self.options.arrowColor.length < 1) {
						var arrowColor = self.$tooltip.css('background-color');
					} else {
						var arrowColor = self.options.arrowColor;
					}

					// if the tooltip was going off the page and had to re-adjust, we need to update the arrow's position
					if (!arrowReposition) {
						arrowReposition = '';
					} else if (arrowReposition == 'left') {
						arrowClass = 'tooltipster-arrow-right';
						arrowReposition = '';
					} else if (arrowReposition == 'right') {
						arrowClass = 'tooltipster-arrow-left';
						arrowReposition = '';
					} else {
						arrowReposition = 'left:' + Math.round(arrowReposition) + 'px;';
					}

					// building the logic to create the border around the arrow of the tooltip
					if (practicalPosition == 'top' || practicalPosition == 'top-left' || practicalPosition == 'top-right') {
						var tooltipBorderWidth = parseFloat(self.$tooltip.css('border-bottom-width')),
						    tooltipBorderColor = self.$tooltip.css('border-bottom-color');
					} else if (practicalPosition == 'bottom' || practicalPosition == 'bottom-left' || practicalPosition == 'bottom-right') {
						var tooltipBorderWidth = parseFloat(self.$tooltip.css('border-top-width')),
						    tooltipBorderColor = self.$tooltip.css('border-top-color');
					} else if (practicalPosition == 'left') {
						var tooltipBorderWidth = parseFloat(self.$tooltip.css('border-right-width')),
						    tooltipBorderColor = self.$tooltip.css('border-right-color');
					} else if (practicalPosition == 'right') {
						var tooltipBorderWidth = parseFloat(self.$tooltip.css('border-left-width')),
						    tooltipBorderColor = self.$tooltip.css('border-left-color');
					} else {
						var tooltipBorderWidth = parseFloat(self.$tooltip.css('border-bottom-width')),
						    tooltipBorderColor = self.$tooltip.css('border-bottom-color');
					}

					if (tooltipBorderWidth > 1) {
						tooltipBorderWidth++;
					}

					var arrowBorder = '';
					if (tooltipBorderWidth !== 0) {
						var arrowBorderSize = '',
						    arrowBorderColor = 'border-color: ' + tooltipBorderColor + ';';
						if (arrowClass.indexOf('bottom') !== -1) {
							arrowBorderSize = 'margin-top: -' + Math.round(tooltipBorderWidth) + 'px;';
						} else if (arrowClass.indexOf('top') !== -1) {
							arrowBorderSize = 'margin-bottom: -' + Math.round(tooltipBorderWidth) + 'px;';
						} else if (arrowClass.indexOf('left') !== -1) {
							arrowBorderSize = 'margin-right: -' + Math.round(tooltipBorderWidth) + 'px;';
						} else if (arrowClass.indexOf('right') !== -1) {
							arrowBorderSize = 'margin-left: -' + Math.round(tooltipBorderWidth) + 'px;';
						}
						arrowBorder = '<span class="tooltipster-arrow-border" style="' + arrowBorderSize + ' ' + arrowBorderColor + ';"></span>';
					}

					// if the arrow already exists, remove and replace it
					self.$tooltip.find('.tooltipster-arrow').remove();

					// build out the arrow and append it
					var arrowConstruct = '<div class="' + arrowClass + ' tooltipster-arrow" style="' + arrowReposition + '">' + arrowBorder + '<span style="border-color:' + arrowColor + ';"></span></div>';
					self.$tooltip.append(arrowConstruct);
				}

				// position the tooltip
				self.$tooltip.css({ 'top': Math.round(myTop) + 'px', 'left': Math.round(myLeft) + 'px' });
			}

			return self;
		},

		enable: function enable() {
			this.enabled = true;
			return this;
		},

		disable: function disable() {
			// hide first, in case the tooltip would not disappear on its own (autoClose false)
			this.hide();
			this.enabled = false;
			return this;
		},

		destroy: function destroy() {

			var self = this;

			self.hide();

			// remove the icon, if any
			if (self.$el[0] !== self.$elProxy[0]) {
				self.$elProxy.remove();
			}

			self.$el.removeData(self.namespace).off('.' + self.namespace);

			var ns = self.$el.data('tooltipster-ns');

			// if there are no more tooltips on this element
			if (ns.length === 1) {

				// optional restoration of a title attribute
				var title = null;
				if (self.options.restoration === 'previous') {
					title = self.$el.data('tooltipster-initialTitle');
				} else if (self.options.restoration === 'current') {

					// old school technique to stringify when outerHTML is not supported
					title = typeof self.Content === 'string' ? self.Content : $('<div></div>').append(self.Content).html();
				}

				if (title) {
					self.$el.attr('title', title);
				}

				// final cleaning
				self.$el.removeClass('tooltipstered').removeData('tooltipster-ns').removeData('tooltipster-initialTitle');
			} else {
				// remove the instance namespace from the list of namespaces of tooltips present on the element
				ns = $.grep(ns, function (el, i) {
					return el !== self.namespace;
				});
				self.$el.data('tooltipster-ns', ns);
			}

			return self;
		},

		elementIcon: function elementIcon() {
			return this.$el[0] !== this.$elProxy[0] ? this.$elProxy[0] : undefined;
		},

		elementTooltip: function elementTooltip() {
			return this.$tooltip ? this.$tooltip[0] : undefined;
		},

		// public methods but for internal use only
		// getter if val is ommitted, setter otherwise
		option: function option(o, val) {
			if (typeof val == 'undefined') return this.options[o];else {
				this.options[o] = val;
				return this;
			}
		},
		status: function status() {
			return this.Status;
		}
	};

	$.fn[pluginName] = function () {

		// for using in closures
		var args = arguments;

		// if we are not in the context of jQuery wrapped HTML element(s) :
		// this happens when calling static methods in the form $.fn.tooltipster('methodName'), or when calling $(sel).tooltipster('methodName or options') where $(sel) does not match anything
		if (this.length === 0) {

			// if the first argument is a method name
			if (typeof args[0] === 'string') {

				var methodIsStatic = true;

				// list static methods here (usable by calling $.fn.tooltipster('methodName');)
				switch (args[0]) {

					case 'setDefaults':
						// change default options for all future instances
						$.extend(defaults, args[1]);
						break;

					default:
						methodIsStatic = false;
						break;
				}

				// $.fn.tooltipster('methodName') calls will return true
				if (methodIsStatic) return true;
				// $(sel).tooltipster('methodName') calls will return the list of objects event though it's empty because chaining should work on empty lists
				else return this;
			}
			// the first argument is undefined or an object of options : we are initalizing but there is no element matched by selector
			else {
					// still chainable : same as above
					return this;
				}
		}
		// this happens when calling $(sel).tooltipster('methodName or options') where $(sel) matches one or more elements
		else {

				// method calls
				if (typeof args[0] === 'string') {

					var v = '#*$~&';

					this.each(function () {

						// retrieve the namepaces of the tooltip(s) that exist on that element. We will interact with the first tooltip only.
						var ns = $(this).data('tooltipster-ns'),

						// self represents the instance of the first tooltipster plugin associated to the current HTML object of the loop
						self = ns ? $(this).data(ns[0]) : null;

						// if the current element holds a tooltipster instance
						if (self) {

							if (typeof self[args[0]] === 'function') {
								// note : args[1] and args[2] may not be defined
								var resp = self[args[0]](args[1], args[2]);
							} else {
								throw new Error('Unknown method .tooltipster("' + args[0] + '")');
							}

							// if the function returned anything other than the instance itself (which implies chaining)
							if (resp !== self) {
								v = resp;
								// return false to stop .each iteration on the first element matched by the selector
								return false;
							}
						} else {
							throw new Error('You called Tooltipster\'s "' + args[0] + '" method on an uninitialized element');
						}
					});

					return v !== '#*$~&' ? v : this;
				}
				// first argument is undefined or an object : the tooltip is initializing
				else {

						var instances = [],

						// is there a defined value for the multiple option in the options object ?
						multipleIsSet = args[0] && typeof args[0].multiple !== 'undefined',

						// if the multiple option is set to true, or if it's not defined but set to true in the defaults
						multiple = multipleIsSet && args[0].multiple || !multipleIsSet && defaults.multiple,

						// same for debug
						debugIsSet = args[0] && typeof args[0].debug !== 'undefined',
						    debug = debugIsSet && args[0].debug || !debugIsSet && defaults.debug;

						// initialize a tooltipster instance for each element if it doesn't already have one or if the multiple option is set, and attach the object to it
						this.each(function () {

							var go = false,
							    ns = $(this).data('tooltipster-ns'),
							    instance = null;

							if (!ns) {
								go = true;
							} else if (multiple) {
								go = true;
							} else if (debug) {
								console.log('Tooltipster: one or more tooltips are already attached to this element: ignoring. Use the "multiple" option to attach more tooltips.');
							}

							if (go) {
								instance = new Plugin(this, args[0]);

								// save the reference of the new instance
								if (!ns) ns = [];
								ns.push(instance.namespace);
								$(this).data('tooltipster-ns', ns);

								// save the instance itself
								$(this).data(instance.namespace, instance);
							}

							instances.push(instance);
						});

						if (multiple) return instances;else return this;
					}
			}
	};

	// quick & dirty compare function (not bijective nor multidimensional)
	function areEqual(a, b) {
		var same = true;
		$.each(a, function (i, el) {
			if (typeof b[i] === 'undefined' || a[i] !== b[i]) {
				same = false;
				return false;
			}
		});
		return same;
	}

	// detect if this device can trigger touch events
	var deviceHasTouchCapability = !!('ontouchstart' in window);

	// we'll assume the device has no mouse until we detect any mouse movement
	var deviceHasMouse = false;
	$('body').one('mousemove', function () {
		deviceHasMouse = true;
	});

	function deviceIsPureTouch() {
		return !deviceHasMouse && deviceHasTouchCapability;
	}

	// detecting support for CSS transitions
	function supportsTransitions() {
		var b = document.body || document.documentElement,
		    s = b.style,
		    p = 'transition';

		if (typeof s[p] == 'string') {
			return true;
		}

		v = ['Moz', 'Webkit', 'Khtml', 'O', 'ms'], p = p.charAt(0).toUpperCase() + p.substr(1);
		for (var i = 0; i < v.length; i++) {
			if (typeof s[v[i] + p] == 'string') {
				return true;
			}
		}
		return false;
	}
})(jQuery, window, document);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInNyYy9qcy9qcXVlcnkudG9vbHRpcHN0ZXIuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7OztBQVdBLENBQUMsQ0FBQyxVQUFVLENBQUMsRUFBRSxNQUFNLEVBQUUsUUFBUSxFQUFFOztBQUVoQyxLQUFJLFVBQVUsR0FBRyxhQUFhO0tBQzdCLFFBQVEsR0FBRztBQUNWLFdBQVMsRUFBRSxNQUFNO0FBQ2pCLE9BQUssRUFBRSxJQUFJO0FBQ1gsWUFBVSxFQUFFLEVBQUU7QUFDZCxXQUFTLEVBQUUsSUFBSTtBQUNmLFNBQU8sRUFBRSxJQUFJO0FBQ2IsZUFBYSxFQUFFLEtBQUs7QUFDcEIsZ0JBQWMsRUFBRSxJQUFJO0FBQ3BCLE9BQUssRUFBRSxJQUFJO0FBQ1gsT0FBSyxFQUFFLEdBQUc7QUFDVixVQUFRLEVBQUUsQ0FBQztBQUNYLFVBQVEsRUFBRSxJQUFJO0FBQ2QsY0FBWSxFQUFFLHNCQUFTLE1BQU0sRUFBRSxPQUFPLEVBQUUsRUFBRTtBQUMxQyxnQkFBYyxFQUFFLHdCQUFTLE1BQU0sRUFBRSxlQUFlLEVBQUU7QUFDakQsa0JBQWUsRUFBRSxDQUFDO0dBQ2xCO0FBQ0QsZUFBYSxFQUFFLHVCQUFTLE1BQU0sRUFBRSxPQUFPLEVBQUUsRUFBRTtBQUMzQyxlQUFhLEVBQUUsdUJBQVMsTUFBTSxFQUFFLEVBQUU7QUFDbEMsYUFBVyxFQUFFLEtBQUs7QUFDbEIsTUFBSSxFQUFFLEtBQUs7QUFDWCxhQUFXLEVBQUUsSUFBSTtBQUNqQixhQUFXLEVBQUUsS0FBSztBQUNsQixXQUFTLEVBQUUsS0FBSztBQUNoQixXQUFTLEVBQUUsa0JBQWtCO0FBQzdCLGFBQVcsRUFBRSxLQUFLO0FBQ2xCLHNCQUFvQixFQUFFLEdBQUc7QUFDekIsVUFBUSxFQUFFLEtBQUs7QUFDZixTQUFPLEVBQUUsQ0FBQztBQUNWLFNBQU8sRUFBRSxDQUFDO0FBQ1YsU0FBTyxFQUFFLEtBQUs7QUFDZCxVQUFRLEVBQUUsS0FBSztBQUNmLGlCQUFlLEVBQUUsS0FB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RUFBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLEdBQUcsQ0FBQyxXQUFXLEVBQUUsWUFBVztBQUNyQyxnQkFBYyxHQUFHLElBQUksQ0FBQztFQUN0QixDQUFDLENBQUM7O0FBRUgsVUFBUyxpQkFBaUIsR0FBRztBQUM1QixTQUFRLENBQUMsY0FBYyxJQUFJLHdCQUF3QixDQUFFO0VBQ3JEOzs7QUFHRCxVQUFTLG1CQUFtQixHQUFHO0FBQzlCLE1BQUksQ0FBQyxHQUFHLFFBQVEsQ0FBQyxJQUFJLElBQUksUUFBUSxDQUFDLGVBQWU7TUFDaEQsQ0FBQyxHQUFHLENBQUMsQ0FBQyxLQUFLO01BQ1gsQ0FBQyxHQUFHLFlBQVksQ0FBQzs7QUFFbEIsTUFBRyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxRQUFRLEVBQUU7QUFBQyxVQUFPLElBQUksQ0FBQztHQUFFOztBQUUzQyxHQUFDLEdBQUcsQ0FBQyxLQUFLLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxHQUFHLEVBQUUsSUFBSSxDQUFDLEVBQ3pDLENBQUMsR0FBRyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLFdBQVcsRUFBRSxHQUFHLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDNUMsT0FBSSxJQUFJLENBQUMsR0FBQyxDQUFDLEVBQUUsQ0FBQyxHQUFDLENBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUU7QUFDN0IsT0FBRyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksUUFBUSxFQUFFO0FBQUUsV0FBTyxJQUFJLENBQUM7SUFBRTtHQUNuRDtBQUNELFNBQU8sS0FBSyxDQUFDO0VBQ2I7Q0FDRCxDQUFBLENBQUcsTUFBTSxFQUFFLE1BQU0sRUFBRSxRQUFRLENBQUUsQ0FBQyIsImZpbGUiOiJzcmMvanMvanF1ZXJ5LnRvb2x0aXBzdGVyLmpzIiwic291cmNlc0NvbnRlbnQiOlsiLypcclxuXHJcblRvb2x0aXBzdGVyIDMuMy4wIHwgMjAxNC0xMS0wOFxyXG5BIHJvY2tpbicgY3VzdG9tIHRvb2x0aXAgalF1ZXJ5IHBsdWdpblxyXG5cclxuRGV2ZWxvcGVkIGJ5IENhbGViIEphY29iIHVuZGVyIHRoZSBNSVQgbGljZW5zZSBodHRwOi8vb3BlbnNvdXJjZS5vcmcvbGljZW5zZXMvTUlUXHJcblxyXG5USEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTIE9SIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0YgTUVSQ0hBTlRBQklMSVRZLCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTiBOTyBFVkVOVCBTSEFMTCBUSEUgQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSwgREFNQUdFUyBPUiBPVEhFUiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLCBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEUgVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRSBTT0ZUV0FSRS5cclxuXHJcbiovXHJcblxyXG47KGZ1bmN0aW9uICgkLCB3aW5kb3csIGRvY3VtZW50KSB7XHJcblxyXG5cdHZhciBwbHVnaW5OYW1lID0gXCJ0b29sdGlwc3RlclwiLFxyXG5cdFx0ZGVmYXVsdHMgPSB7XHJcblx0XHRcdGFuaW1hdGlvbjogJ2ZhZGUnLFxyXG5cdFx0XHRhcnJvdzogdHJ1ZSxcclxuXHRcdFx0YXJyb3dDb2xvcjogJycsXHJcblx0XHRcdGF1dG9DbG9zZTogdHJ1ZSxcblx0XHRcdGNvbnRlbnQ6IG51bGwsXHJcblx0XHRcdGNvbnRlbnRBc0hUTUw6IGZhbHNlLFxyXG5cdFx0XHRjb250ZW50Q2xvbmluZzogdHJ1ZSxcclxuXHRcdFx0ZGVidWc6IHRydWUsXHJcblx0XHRcdGRlbGF5OiAyMDAsXHJcblx0XHRcdG1pbldpZHRoOiAwLFxyXG5cdFx0XHRtYXhXaWR0aDogbnVsbCxcclxuXHRcdFx0ZnVuY3Rpb25Jbml0OiBmdW5jdGlvbihvcmlnaW4sIGNvbnRlbnQpIHt9LFxyXG5cdFx0XHRmdW5jdGlvbkJlZm9yZTogZnVuY3Rpb24ob3JpZ2luLCBjb250aW51ZVRvb2x0aXApIHtcclxuXHRcdFx0XHRjb250aW51ZVRvb2x0aXAoKTtcclxuXHRcdFx0fSxcclxuXHRcdFx0ZnVuY3Rpb25SZWFkeTogZnVuY3Rpb24ob3JpZ2luLCB0b29sdGlwKSB7fSxcclxuXHRcdFx0ZnVuY3Rpb25BZnRlcjogZnVuY3Rpb24ob3JpZ2luKSB7fSxcclxuXHRcdFx0aGlkZU9uQ2xpY2s6IGZhbHNlLFxyXG5cdFx0XHRpY29uOiAnKD8pJyxcclxuXHRcdFx0aWNvbkNsb25pbmc6IHRydWUsXHJcblx0XHRcdGljb25EZXNrdG9wOiBmYWxzZSxcclxuXHRcdFx0aWNvblRvdWNoOiBmYWxzZSxcclxuXHRcdFx0aWNvblRoZW1lOiAndG9vbHRpcHN0ZXItaWNvbicsXHJcblx0XHRcdGludGVyYWN0aXZlOiBmYWxzZSxcclxuXHRcdFx0aW50ZXJhY3RpdmVUb2xlcmFuY2U6IDM1MCxcclxuXHRcdFx0bXVsdGlwbGU6IGZhbHNlLFxyXG5cdFx0XHRvZmZzZXRYOiAwLFxyXG5cdFx0XHRvZmZzZXRZOiAwLFxyXG5cdFx0XHRvbmx5T25lOiBmYWxzZSxcclxuXHRcdFx0cG9zaXRpb246ICd0b3AnLFxyXG5cdFx0XHRwb3NpdGlvblRyYWNrZXI6IGZhbHNlLFxuXHRcdFx0cG9zaXRpb25UcmFja2VyQ2FsbGJhY2s6IGZ1bmN0aW9uKG9yaWdpbil7XG5cdFx0XHRcdC8vIHRoZSBkZWZhdWx0IHRyYWNrZXIgY2FsbGJhY2sgd2lsbCBjbG9zZSB0aGUgdG9vbHRpcCB3aGVuIHRoZSB0cmlnZ2VyIGlzXG5cdFx0XHRcdC8vICdob3ZlcicgKHNlZSBodHRwczovL2dpdGh1Yi5jb20vaWFtY2VlZ2UvdG9vbHRpcHN0ZXIvcHVsbC8yNTMpXG5cdFx0XHRcdGlmKHRoaXMub3B0aW9uKCd0cmlnZ2VyJykgPT0gJ2hvdmVyJyAmJiB0aGlzLm9wdGlvbignYXV0b0Nsb3NlJykpIHtcblx0XHRcdFx0XHR0aGlzLmhpZGUoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcclxuXHRcdFx0cmVzdG9yYXRpb246ICdjdXJyZW50JyxcclxuXHRcdFx0c3BlZWQ6IDM1MCxcclxuXHRcdFx0dGltZXI6IDAsXHJcblx0XHRcdHRoZW1lOiAndG9vbHRpcHN0ZXItZGVmYXVsdCcsXHJcblx0XHRcdHRvdWNoRGV2aWNlczogdHJ1ZSxcclxuXHRcdFx0dHJpZ2dlcjogJ2hvdmVyJyxcclxuXHRcdFx0dXBkYXRlQW5pbWF0aW9uOiB0cnVlXHJcblx0XHR9O1xyXG5cdFxyXG5cdGZ1bmN0aW9uIFBsdWdpbihlbGVtZW50LCBvcHRpb25zKSB7XHJcblx0XHRcclxuXHRcdC8vIGxpc3Qgb2YgaW5zdGFuY2UgdmFyaWFibGVzXHJcblx0XHRcclxuXHRcdHRoaXMuYm9keU92ZXJmbG93WDtcclxuXHRcdC8vIHN0YWNrIG9mIGN1c3RvbSBjYWxsYmFja3MgcHJvdmlkZWQgYXMgcGFyYW1ldGVycyB0byBBUEkgbWV0aG9kc1xyXG5cdFx0dGhpcy5jYWxsYmFja3MgPSB7XHJcblx0XHRcdGhpZGU6IFtdLFxyXG5cdFx0XHRzaG93OiBbXVxyXG5cdFx0fTtcclxuXHRcdHRoaXMuY2hlY2tJbnRlcnZhbCA9IG51bGw7XHJcblx0XHQvLyB0aGlzIHdpbGwgYmUgdGhlIHVzZXIgY29udGVudCBzaG93biBpbiB0aGUgdG9vbHRpcC4gQSBjYXBpdGFsIFwiQ1wiIGlzIHVzZWQgYmVjYXVzZSB0aGVyZSBpcyBhbHNvIGEgbWV0aG9kIGNhbGxlZCBjb250ZW50KClcclxuXHRcdHRoaXMuQ29udGVudDtcclxuXHRcdC8vIHRoaXMgaXMgdGhlIG9yaWdpbmFsIGVsZW1lbnQgd2hpY2ggaXMgYmVpbmcgYXBwbGllZCB0aGUgdG9vbHRpcHN0ZXIgcGx1Z2luXHJcblx0XHR0aGlzLiRlbCA9ICQoZWxlbWVudCk7XHJcblx0XHQvLyB0aGlzIHdpbGwgYmUgdGhlIGVsZW1lbnQgd2hpY2ggdHJpZ2dlcnMgdGhlIGFwcGVhcmFuY2Ugb2YgdGhlIHRvb2x0aXAgb24gaG92ZXIvY2xpY2svY3VzdG9tIGV2ZW50cy5cclxuXHRcdC8vIGl0IHdpbGwgYmUgdGhlIHNhbWUgYXMgdGhpcy4kZWwgaWYgaWNvbnMgYXJlIG5vdCB1c2VkIChzZWUgaW4gdGhlIG9wdGlvbnMpLCBvdGhlcndpc2UgaXQgd2lsbCBjb3JyZXNwb25kIHRvIHRoZSBjcmVhdGVkIGljb25cclxuXHRcdHRoaXMuJGVsUHJveHk7XHJcblx0XHR0aGlzLmVsUHJveHlQb3NpdGlvbjtcclxuXHRcdHRoaXMuZW5hYmxlZCA9IHRydWU7XHJcblx0XHR0aGlzLm9wdGlvbnMgPSAkLmV4dGVuZCh7fSwgZGVmYXVsdHMsIG9wdGlvbnMpO1xyXG5cdFx0dGhpcy5tb3VzZUlzT3ZlclByb3h5ID0gZmFsc2U7XHJcblx0XHQvLyBhIHVuaXF1ZSBuYW1lc3BhY2UgcGVyIGluc3RhbmNlLCBmb3IgZWFzeSBzZWxlY3RpdmUgdW5iaW5kaW5nXHJcblx0XHR0aGlzLm5hbWVzcGFjZSA9ICd0b29sdGlwc3Rlci0nKyBNYXRoLnJvdW5kKE1hdGgucmFuZG9tKCkqMTAwMDAwKTtcclxuXHRcdC8vIFN0YXR1cyAoY2FwaXRhbCBTKSBjYW4gYmUgZWl0aGVyIDogYXBwZWFyaW5nLCBzaG93biwgZGlzYXBwZWFyaW5nLCBoaWRkZW5cclxuXHRcdHRoaXMuU3RhdHVzID0gJ2hpZGRlbic7XHJcblx0XHR0aGlzLnRpbWVySGlkZSA9IG51bGw7XHJcblx0XHR0aGlzLnRpbWVyU2hvdyA9IG51bGw7XHJcblx0XHQvLyB0aGlzIHdpbGwgYmUgdGhlIHRvb2x0aXAgZWxlbWVudCAoalF1ZXJ5IHdyYXBwZWQgSFRNTCBlbGVtZW50KVxyXG5cdFx0dGhpcy4kdG9vbHRpcDtcclxuXHRcdFxyXG5cdFx0Ly8gZm9yIGJhY2t3YXJkIGNvbXBhdGliaWxpdHlcclxuXHRcdHRoaXMub3B0aW9ucy5pY29uVGhlbWUgPSB0aGlzLm9wdGlvbnMuaWNvblRoZW1lLnJlcGxhY2UoJy4nLCAnJyk7XHJcblx0XHR0aGlzLm9wdGlvbnMudGhlbWUgPSB0aGlzLm9wdGlvbnMudGhlbWUucmVwbGFjZSgnLicsICcnKTtcclxuXHRcdFxyXG5cdFx0Ly8gbGF1bmNoXHJcblx0XHRcclxuXHRcdHRoaXMuX2luaXQoKTtcclxuXHR9XHJcblx0XHJcblx0UGx1Z2luLnByb3RvdHlwZSA9IHtcclxuXHRcdFxyXG5cdFx0X2luaXQ6IGZ1bmN0aW9uKCkge1xyXG5cdFx0XHRcclxuXHRcdFx0dmFyIHNlbGYgPSB0aGlzO1xyXG5cdFx0XHRcclxuXHRcdFx0Ly8gZGlzYWJsZSB0aGUgcGx1Z2luIG9uIG9sZCBicm93c2VycyAoaW5jbHVkaW5nIElFNyBhbmQgbG93ZXIpXHJcblx0XHRcdGlmIChkb2N1bWVudC5xdWVyeVNlbGVjdG9yKSB7XHJcblx0XHRcdFx0XHJcblx0XHRcdFx0Ly8gbm90ZSA6IHRoZSBjb250ZW50IGlzIG51bGwgKGVtcHR5KSBieSBkZWZhdWx0IGFuZCBjYW4gc3RheSB0aGF0IHdheSBpZiB0aGUgcGx1Z2luIHJlbWFpbnMgaW5pdGlhbGl6ZWQgYnV0IG5vdCBmZWQgYW55IGNvbnRlbnQuIFRoZSB0b29sdGlwIHdpbGwganVzdCBub3QgYXBwZWFyLlxyXG5cdFx0XHRcdFxyXG5cdFx0XHRcdC8vIGxldCdzIHNhdmUgdGhlIGluaXRpYWwgdmFsdWUgb2YgdGhlIHRpdGxlIGF0dHJpYnV0ZSBmb3IgbGF0ZXIgcmVzdG9yYXRpb24gaWYgbmVlZCBiZS5cclxuXHRcdFx0XHR2YXIgaW5pdGlhbFRpdGxlID0gbnVsbDtcclxuXHRcdFx0XHQvLyBpdCB3aWxsIGFscmVhZHkgaGF2ZSBiZWVuIHNhdmVkIGluIGNhc2Ugb2YgbXVsdGlwbGUgdG9vbHRpcHNcclxuXHRcdFx0XHRpZiAoc2VsZi4kZWwuZGF0YSgndG9vbHRpcHN0ZXItaW5pdGlhbFRpdGxlJykgPT09IHVuZGVmaW5lZCkge1xyXG5cdFx0XHRcdFx0XHJcblx0XHRcdFx0XHRpbml0aWFsVGl0bGUgPSBzZWxmLiRlbC5hdHRyKCd0aXRsZScpO1xyXG5cdFx0XHRcdFx0XHJcblx0XHRcdFx0XHQvLyB3ZSBkbyBub3Qgd2FudCBpbml0aWFsVGl0bGUgdG8gaGF2ZSB0aGUgdmFsdWUgXCJ1bmRlZmluZWRcIiBiZWNhdXNlIG9mIGhvdyBqUXVlcnkncyAuZGF0YSgpIG1ldGhvZCB3b3Jrc1xyXG5cdFx0XHRcdFx0aWYgKGluaXRpYWxUaXRsZSA9PT0gdW5kZWZpbmVkKSBpbml0aWFsVGl0bGUgPSBudWxsO1xyXG5cdFx0XHRcdFx0XHJcblx0XHRcdFx0XHRzZWxmLiRlbC5kYXRhKCd0b29sdGlwc3Rlci1pbml0aWFsVGl0bGUnLCBpbml0aWFsVGl0bGUpO1xyXG5cdFx0XHRcdH1cclxuXHRcdFx0XHRcclxuXHRcdFx0XHQvLyBpZiBjb250ZW50IGlzIHByb3ZpZGVkIGluIHRoZSBvcHRpb25zLCBpdHMgaGFzIHByZWNlZGVuY2Ugb3ZlciB0aGUgdGl0bGUgYXR0cmlidXRlLlxyXG5cdFx0XHRcdC8vIE5vdGUgOiBhbiBlbXB0eSBzdHJpbmcgaXMgY29uc2lkZXJlZCBjb250ZW50LCBvbmx5ICdudWxsJyByZXByZXNlbnRzIHRoZSBhYnNlbmNlIG9mIGNvbnRlbnQuXHJcblx0XHRcdFx0Ly8gQWxzbywgYW4gZXhpc3RpbmcgdGl0bGU9XCJcIiBhdHRyaWJ1dGUgd2lsbCByZXN1bHQgaW4gYW4gZW1wdHkgc3RyaW5nIGNvbnRlbnRcclxuXHRcdFx0XHRpZiAoc2VsZi5vcHRpb25zLmNvbnRlbnQgIT09IG51bGwpe1xyXG5cdFx0XHRcdFx0c2VsZi5fY29udGVudF9zZXQoc2VsZi5vcHRpb25zLmNvbnRlbnQpO1xyXG5cdFx0XHRcdH1cclxuXHRcdFx0XHRlbHNlIHtcclxuXHRcdFx0XHRcdHNlbGYuX2NvbnRlbnRfc2V0KGluaXRpYWxUaXRsZSk7XHJcblx0XHRcdFx0fVxyXG5cdFx0XHRcdFxyXG5cdFx0XHRcdHZhciBjID0gc2VsZi5vcHRpb25zLmZ1bmN0aW9uSW5pdC5jYWxsKHNlbGYuJGVsLCBzZWxmLiRlbCwgc2VsZi5Db250ZW50KTtcclxuXHRcdFx0XHRpZih0eXBlb2YgYyAhPT0gJ3VuZGVmaW5lZCcpIHNlbGYuX2NvbnRlbnRfc2V0KGMpO1xyXG5cdFx0XHRcdFxyXG5cdFx0XHRcdHNlbGYuJGVsXHJcblx0XHRcdFx0XHQvLyBzdHJpcCB0aGUgdGl0bGUgb2ZmIG9mIHRoZSBlbGVtZW50IHRvIHByZXZlbnQgdGhlIGRlZmF1bHQgdG9vbHRpcHMgZnJvbSBwb3BwaW5nIHVwXHJcblx0XHRcdFx0XHQucmVtb3ZlQXR0cigndGl0bGUnKVxyXG5cdFx0XHRcdFx0Ly8gdG8gYmUgYWJsZSB0byBmaW5kIGFsbCBpbnN0YW5jZXMgb24gdGhlIHBhZ2UgbGF0ZXIgKHVwb24gd2luZG93IGV2ZW50cyBpbiBwYXJ0aWN1bGFyKVxyXG5cdFx0XHRcdFx0LmFkZENsYXNzKCd0b29sdGlwc3RlcmVkJyk7XHJcblxyXG5cdFx0XHRcdC8vIGRldGVjdCBpZiB3ZSdyZSBjaGFuZ2luZyB0aGUgdG9vbHRpcCBvcmlnaW4gdG8gYW4gaWNvblxyXG5cdFx0XHRcdC8vIG5vdGUgYWJvdXQgdGhpcyBjb25kaXRpb24gOiBpZiB0aGUgZGV2aWNlIGhhcyB0b3VjaCBjYXBhYmlsaXR5IGFuZCBzZWxmLm9wdGlvbnMuaWNvblRvdWNoIGlzIGZhbHNlLCB5b3UnbGwgaGF2ZSBubyBpY29ucyBldmVudCB0aG91Z2ggeW91IG1heSBjb25zaWRlciB5b3VyIGRldmljZSBhcyBhIGRlc2t0b3AgaWYgaXQgYWxzbyBoYXMgYSBtb3VzZS4gTm90IHN1cmUgd2h5IHNvbWVvbmUgd291bGQgaGF2ZSB0aGlzIHVzZSBjYXNlIHRob3VnaC5cclxuXHRcdFx0XHRpZiAoKCFkZXZpY2VIYXNUb3VjaENhcGFiaWxpdHkgJiYgc2VsZi5vcHRpb25zLmljb25EZXNrdG9wKSB8fCAoZGV2aWNlSGFzVG91Y2hDYXBhYmlsaXR5ICYmIHNlbGYub3B0aW9ucy5pY29uVG91Y2gpKSB7XHJcblx0XHRcdFx0XHRcclxuXHRcdFx0XHRcdC8vIFRPRE8gOiB0aGUgdG9vbHRpcCBzaG91bGQgYmUgYXV0b21hdGljYWxseSBiZSBnaXZlbiBhbiBhYnNvbHV0ZSBwb3NpdGlvbiB0byBiZSBuZWFyIHRoZSBvcmlnaW4uIE90aGVyd2lzZSwgd2hlbiB0aGUgb3JpZ2luIGlzIGZsb2F0aW5nIG9yIHdoYXQsIGl0J3MgZ29pbmcgdG8gYmUgbm93aGVyZSBuZWFyIGl0IGFuZCBkaXN0dXJiIHRoZSBwb3NpdGlvbiBmbG93IG9mIHRoZSBwYWdlIGVsZW1lbnRzLiBJdCB3aWxsIGltcGx5IHRoYXQgdGhlIGljb24gYWxzbyBkZXRlY3RzIHdoZW4gaXRzIG9yaWdpbiBtb3ZlcywgdG8gZm9sbG93IGl0IDogbm90IHRyaXZpYWwuXHJcblx0XHRcdFx0XHQvLyBVbnRpbCBpdCdzIGRvbmUsIHRoZSBpY29uIGZlYXR1cmUgZG9lcyBub3QgcmVhbGx5IG1ha2Ugc2Vuc2Ugc2luY2UgdGhlIHVzZXIgc3RpbGwgaGFzIG1vc3Qgb2YgdGhlIHdvcmsgdG8gZG8gYnkgaGltc2VsZlxyXG5cdFx0XHRcdFx0XHJcblx0XHRcdFx0XHQvLyBpZiB0aGUgaWNvbiBwcm92aWRlZCBpcyBpbiB0aGUgZm9ybSBvZiBhIHN0cmluZ1xyXG5cdFx0XHRcdFx0aWYodHlwZW9mIHNlbGYub3B0aW9ucy5pY29uID09PSAnc3RyaW5nJyl7XHJcblx0XHRcdFx0XHRcdC8vIHdyYXAgaXQgaW4gYSBzcGFuIHdpdGggdGhlIGljb24gY2xhc3NcclxuXHRcdFx0XHRcdFx0c2VsZi4kZWxQcm94eSA9ICQoJzxzcGFuIGNsYXNzPVwiJysgc2VsZi5vcHRpb25zLmljb25UaGVtZSArJ1wiPjwvc3Bhbj4nKTtcclxuXHRcdFx0XHRcdFx0c2VsZi4kZWxQcm94eS50ZXh0KHNlbGYub3B0aW9ucy5pY29uKTtcclxuXHRcdFx0XHRcdH1cclxuXHRcdFx0XHRcdC8vIGlmIGl0IGlzIGFuIG9iamVjdCAoc2Vuc2libGUgY2hvaWNlKVxyXG5cdFx0XHRcdFx0ZWxzZSB7XHJcblx0XHRcdFx0XHRcdC8vIChkZWVwKSBjbG9uZSB0aGUgb2JqZWN0IGlmIGljb25DbG9uaW5nID09IHRydWUsIHRvIG1ha2Ugc3VyZSBldmVyeSBpbnN0YW5jZSBoYXMgaXRzIG93biBwcm94eS4gV2UgdXNlIHRoZSBpY29uIHdpdGhvdXQgd3JhcHBpbmcsIG5vIG5lZWQgdG8uIFdlIGRvIG5vdCBnaXZlIGl0IGEgY2xhc3MgZWl0aGVyLCBhcyB0aGUgdXNlciB3aWxsIHVuZG91YnRlZGx5IHN0eWxlIHRoZSBvYmplY3Qgb24gaGlzIG93biBhbmQgc2luY2Ugb3VyIGNzcyBwcm9wZXJ0aWVzIG1heSBjb25mbGljdCB3aXRoIGhpcyBvd25cclxuXHRcdFx0XHRcdFx0aWYgKHNlbGYub3B0aW9ucy5pY29uQ2xvbmluZykgc2VsZi4kZWxQcm94eSA9IHNlbGYub3B0aW9ucy5pY29uLmNsb25lKHRydWUpO1xyXG5cdFx0XHRcdFx0XHRlbHNlIHNlbGYuJGVsUHJveHkgPSBzZWxmLm9wdGlvbnMuaWNvbjtcclxuXHRcdFx0XHRcdH1cclxuXHRcdFx0XHRcdFxyXG5cdFx0XHRcdFx0c2VsZi4kZWxQcm94eS5pbnNlcnRBZnRlcihzZWxmLiRlbCk7XHJcblx0XHRcdFx0fVxyXG5cdFx0XHRcdGVsc2Uge1xyXG5cdFx0XHRcdFx0c2VsZi4kZWxQcm94eSA9IHNlbGYuJGVsO1xyXG5cdFx0XHRcdH1cclxuXHRcdFx0XHRcclxuXHRcdFx0XHQvLyBmb3IgJ2NsaWNrJyBhbmQgJ2hvdmVyJyB0cmlnZ2VycyA6IGJpbmQgb24gZXZlbnRzIHRvIG9wZW4gdGhlIHRvb2x0aXAuIENsb3NpbmcgaXMgbm93IGhhbmRsZWQgaW4gX3Nob3dOb3coKSBiZWNhdXNlIG9mIGl0cyBiaW5kaW5ncy5cclxuXHRcdFx0XHQvLyBOb3RlcyBhYm91dCB0b3VjaCBldmVudHMgOlxyXG5cdFx0XHRcdFx0Ly8gLSBtb3VzZWVudGVyLCBtb3VzZWxlYXZlIGFuZCBjbGlja3MgaGFwcGVuIGV2ZW4gb24gcHVyZSB0b3VjaCBkZXZpY2VzIGJlY2F1c2UgdGhleSBhcmUgZW11bGF0ZWQuIGRldmljZUlzUHVyZVRvdWNoKCkgaXMgYSBzaW1wbGUgYXR0ZW1wdCB0byBkZXRlY3QgdGhlbS5cclxuXHRcdFx0XHRcdC8vIC0gb24gaHlicmlkIGRldmljZXMsIHdlIGRvIG5vdCBwcmV2ZW50IHRvdWNoIGdlc3R1cmUgZnJvbSBvcGVuaW5nIHRvb2x0aXBzLiBJdCB3b3VsZCBiZSB0b28gY29tcGxleCB0byBkaWZmZXJlbnRpYXRlIHJlYWwgbW91c2UgZXZlbnRzIGZyb20gZW11bGF0ZWQgb25lcy5cclxuXHRcdFx0XHRcdC8vIC0gd2UgY2hlY2sgZGV2aWNlSXNQdXJlVG91Y2goKSBhdCBlYWNoIGV2ZW50IHJhdGhlciB0aGFuIHByaW9yIHRvIGJpbmRpbmcgYmVjYXVzZSB0aGUgc2l0dWF0aW9uIG1heSBjaGFuZ2UgZHVyaW5nIGJyb3dzaW5nXHJcblx0XHRcdFx0aWYgKHNlbGYub3B0aW9ucy50cmlnZ2VyID09ICdob3ZlcicpIHtcclxuXHRcdFx0XHRcdFxyXG5cdFx0XHRcdFx0Ly8gdGhlc2UgYmluZGluZyBhcmUgZm9yIG1vdXNlIGludGVyYWN0aW9uIG9ubHlcclxuXHRcdFx0XHRcdHNlbGYuJGVsUHJveHlcclxuXHRcdFx0XHRcdFx0Lm9uKCdtb3VzZWVudGVyLicrIHNlbGYubmFtZXNwYWNlLCBmdW5jdGlvbigpIHtcclxuXHRcdFx0XHRcdFx0XHRpZiAoIWRldmljZUlzUHVyZVRvdWNoKCkgfHwgc2VsZi5vcHRpb25zLnRvdWNoRGV2aWNlcykge1xyXG5cdFx0XHRcdFx0XHRcdFx0c2VsZi5tb3VzZUlzT3ZlclByb3h5ID0gdHJ1ZTtcclxuXHRcdFx0XHRcdFx0XHRcdHNlbGYuX3Nob3coKTtcclxuXHRcdFx0XHRcdFx0XHR9XHJcblx0XHRcdFx0XHRcdH0pXHJcblx0XHRcdFx0XHRcdC5vbignbW91c2VsZWF2ZS4nKyBzZWxmLm5hbWVzcGFjZSwgZnVuY3Rpb24oKSB7XHJcblx0XHRcdFx0XHRcdFx0aWYgKCFkZXZpY2VJc1B1cmVUb3VjaCgpIHx8IHNlbGYub3B0aW9ucy50b3VjaERldmljZXMpIHtcclxuXHRcdFx0XHRcdFx0XHRcdHNlbGYubW91c2VJc092ZXJQcm94eSA9IGZhbHNlO1xyXG5cdFx0XHRcdFx0XHRcdH1cclxuXHRcdFx0XHRcdFx0fSk7XHJcblx0XHRcdFx0XHRcclxuXHRcdFx0XHRcdC8vIGZvciB0b3VjaCBpbnRlcmFjdGlvbiBvbmx5XHJcblx0XHRcdFx0XHRpZiAoZGV2aWNlSGFzVG91Y2hDYXBhYmlsaXR5ICYmIHNlbGYub3B0aW9ucy50b3VjaERldmljZXMpIHtcclxuXHRcdFx0XHRcdFx0XHJcblx0XHRcdFx0XHRcdC8vIGZvciB0b3VjaCBkZXZpY2VzLCB3ZSBpbW1lZGlhdGVseSBkaXNwbGF5IHRoZSB0b29sdGlwIGJlY2F1c2Ugd2UgY2Fubm90IHJlbHkgb24gbW91c2VsZWF2ZSB0byBoYW5kbGUgdGhlIGRlbGF5XHJcblx0XHRcdFx0XHRcdHNlbGYuJGVsUHJveHkub24oJ3RvdWNoc3RhcnQuJysgc2VsZi5uYW1lc3BhY2UsIGZ1bmN0aW9uKCkge1xyXG5cdFx0XHRcdFx0XHRcdHNlbGYuX3Nob3dOb3coKTtcclxuXHRcdFx0XHRcdFx0fSk7XHJcblx0XHRcdFx0XHR9XHJcblx0XHRcdFx0fVxyXG5cdFx0XHRcdGVsc2UgaWYgKHNlbGYub3B0aW9ucy50cmlnZ2VyID09ICdjbGljaycpIHtcclxuXHRcdFx0XHRcdFxyXG5cdFx0XHRcdFx0Ly8gbm90ZSA6IGZvciB0b3VjaCBkZXZpY2VzLCB3ZSBkbyBub3QgYmluZCBvbiB0b3VjaHN0YXJ0LCB3ZSBvbmx5IHJlbHkgb24gdGhlIGVtdWxhdGVkIGNsaWNrcyAodHJpZ2dlcmVkIGJ5IHRhcHMpXHJcblx0XHRcdFx0XHRzZWxmLiRlbFByb3h5Lm9uKCdjbGljay4nKyBzZWxmLm5hbWVzcGFjZSwgZnVuY3Rpb24oKSB7XHJcblx0XHRcdFx0XHRcdGlmICghZGV2aWNlSXNQdXJlVG91Y2goKSB8fCBzZWxmLm9wdGlvbnMudG91Y2hEZXZpY2VzKSB7XHJcblx0XHRcdFx0XHRcdFx0c2VsZi5fc2hvdygpO1xyXG5cdFx0XHRcdFx0XHR9XHJcblx0XHRcdFx0XHR9KTtcclxuXHRcdFx0XHR9XHJcblx0XHRcdH1cclxuXHRcdH0sXHJcblx0XHRcclxuXHRcdC8vIHRoaXMgZnVuY3Rpb24gd2lsbCBzY2hlZHVsZSB0aGUgb3BlbmluZyBvZiB0aGUgdG9vbHRpcCBhZnRlciB0aGUgZGVsYXksIGlmIHRoZXJlIGlzIG9uZVxyXG5cdFx0X3Nob3c6IGZ1bmN0aW9uKCkge1xyXG5cdFx0XHRcclxuXHRcdFx0dmFyIHNlbGYgPSB0aGlzO1xyXG5cdFx0XHRcclxuXHRcdFx0aWYgKHNlbGYuU3RhdHVzICE9ICdzaG93bicgJiYgc2VsZi5TdGF0dXMgIT0gJ2FwcGVhcmluZycpIHtcclxuXHRcdFx0XHRcclxuXHRcdFx0XHRpZiAoc2VsZi5vcHRpb25zLmRlbGF5KSB7XHJcblx0XHRcdFx0XHRzZWxmLnRpbWVyU2hvdyA9IHNldFRpbWVvdXQoZnVuY3Rpb24oKXtcclxuXHRcdFx0XHRcdFx0XHJcblx0XHRcdFx0XHRcdC8vIGZvciBob3ZlciB0cmlnZ2VyLCB3ZSBjaGVjayBpZiB0aGUgbW91c2UgaXMgc3RpbGwgb3ZlciB0aGUgcHJveHksIG90aGVyd2lzZSB3ZSBkbyBub3Qgc2hvdyBhbnl0aGluZ1xyXG5cdFx0XHRcdFx0XHRpZiAoc2VsZi5vcHRpb25zLnRyaWdnZXIgPT0gJ2NsaWNrJyB8fCAoc2VsZi5vcHRpb25zLnRyaWdnZXIgPT0gJ2hvdmVyJyAmJiBzZWxmLm1vdXNlSXNPdmVyUHJveHkpKSB7XHJcblx0XHRcdFx0XHRcdFx0c2VsZi5fc2hvd05vdygpO1xyXG5cdFx0XHRcdFx0XHR9XHJcblx0XHRcdFx0XHR9LCBzZWxmLm9wdGlvbnMuZGVsYXkpO1xyXG5cdFx0XHRcdH1cclxuXHRcdFx0XHRlbHNlIHNlbGYuX3Nob3dOb3coKTtcclxuXHRcdFx0fVxyXG5cdFx0fSxcclxuXHRcdFxyXG5cdFx0Ly8gdGhpcyBmdW5jdGlvbiB3aWxsIG9wZW4gdGhlIHRvb2x0aXAgcmlnaHQgYXdheVxyXG5cdFx0X3Nob3dOb3c6IGZ1bmN0aW9uKGNhbGxiYWNrKSB7XHJcblx0XHRcdFxyXG5cdFx0XHR2YXIgc2VsZiA9IHRoaXM7XHJcblx0XHRcdFxyXG5cdFx0XHQvLyBjYWxsIG91ciBjb25zdHJ1Y3RvciBjdXN0b20gZnVuY3Rpb24gYmVmb3JlIGNvbnRpbnVpbmdcclxuXHRcdFx0c2VsZi5vcHRpb25zLmZ1bmN0aW9uQmVmb3JlLmNhbGwoc2VsZi4kZWwsIHNlbGYuJGVsLCBmdW5jdGlvbigpIHtcclxuXHRcdFx0XHRcclxuXHRcdFx0XHQvLyBjb250aW51ZSBvbmx5IGlmIHRoZSB0b29sdGlwIGlzIGVuYWJsZWQgYW5kIGhhcyBhbnkgY29udGVudFxyXG5cdFx0XHRcdGlmIChzZWxmLmVuYWJsZWQgJiYgc2VsZi5Db250ZW50ICE9PSBudWxsKSB7XHJcblx0XHRcdFx0XHJcblx0XHRcdFx0XHQvLyBzYXZlIHRoZSBtZXRob2QgY2FsbGJhY2sgYW5kIGNhbmNlbCBoaWRlIG1ldGhvZCBjYWxsYmFja3NcclxuXHRcdFx0XHRcdGlmIChjYWxsYmFjaykgc2VsZi5jYWxsYmFja3Muc2hvdy5wdXNoKGNhbGxiYWNrKTtcclxuXHRcdFx0XHRcdHNlbGYuY2FsbGJhY2tzLmhpZGUgPSBbXTtcclxuXHRcdFx0XHRcdFxyXG5cdFx0XHRcdFx0Ly9nZXQgcmlkIG9mIGFueSBhcHBlYXJhbmNlIHRpbWVyXHJcblx0XHRcdFx0XHRjbGVhclRpbWVvdXQoc2VsZi50aW1lclNob3cpO1xyXG5cdFx0XHRcdFx0c2VsZi50aW1lclNob3cgPSBudWxsO1xyXG5cdFx0XHRcdFx0Y2xlYXJUaW1lb3V0KHNlbGYudGltZXJIaWRlKTtcclxuXHRcdFx0XHRcdHNlbGYudGltZXJIaWRlID0gbnVsbDtcclxuXHRcdFx0XHRcdFxyXG5cdFx0XHRcdFx0Ly8gaWYgd2Ugb25seSB3YW50IG9uZSB0b29sdGlwIG9wZW4gYXQgYSB0aW1lLCBjbG9zZSBhbGwgYXV0by1jbG9zaW5nIHRvb2x0aXBzIGN1cnJlbnRseSBvcGVuIGFuZCBub3QgYWxyZWFkeSBkaXNhcHBlYXJpbmdcclxuXHRcdFx0XHRcdGlmIChzZWxmLm9wdGlvbnMub25seU9uZSkge1xyXG5cdFx0XHRcdFx0XHQkKCcudG9vbHRpcHN0ZXJlZCcpLm5vdChzZWxmLiRlbCkuZWFjaChmdW5jdGlvbihpLGVsKSB7XHJcblx0XHRcdFx0XHRcdFx0XHJcblx0XHRcdFx0XHRcdFx0dmFyICRlbCA9ICQoZWwpLFxyXG5cdFx0XHRcdFx0XHRcdFx0bnNzID0gJGVsLmRhdGEoJ3Rvb2x0aXBzdGVyLW5zJyk7XHJcblx0XHRcdFx0XHRcdFx0XHJcblx0XHRcdFx0XHRcdFx0Ly8gaXRlcmF0ZSBvbiBhbGwgdG9vbHRpcHMgb2YgdGhlIGVsZW1lbnRcclxuXHRcdFx0XHRcdFx0XHQkLmVhY2gobnNzLCBmdW5jdGlvbihpLCBucyl7XHJcblx0XHRcdFx0XHRcdFx0XHR2YXIgaW5zdGFuY2UgPSAkZWwuZGF0YShucyksXHJcblx0XHRcdFx0XHRcdFx0XHRcdC8vIHdlIGhhdmUgdG8gdXNlIHRoZSBwdWJsaWMgbWV0aG9kcyBoZXJlXHJcblx0XHRcdFx0XHRcdFx0XHRcdHMgPSBpbnN0YW5jZS5zdGF0dXMoKSxcclxuXHRcdFx0XHRcdFx0XHRcdFx0YWMgPSBpbnN0YW5jZS5vcHRpb24oJ2F1dG9DbG9zZScpO1xyXG5cdFx0XHRcdFx0XHRcdFx0XHJcblx0XHRcdFx0XHRcdFx0XHRpZiAocyAhPT0gJ2hpZGRlbicgJiYgcyAhPT0gJ2Rpc2FwcGVhcmluZycgJiYgYWMpIHtcclxuXHRcdFx0XHRcdFx0XHRcdFx0aW5zdGFuY2UuaGlkZSgpO1xyXG5cdFx0XHRcdFx0XHRcdFx0fVxyXG5cdFx0XHRcdFx0XHRcdH0pO1xyXG5cdFx0XHRcdFx0XHR9KTtcclxuXHRcdFx0XHRcdH1cclxuXHRcdFx0XHRcdFxyXG5cdFx0XHRcdFx0dmFyIGZpbmlzaCA9IGZ1bmN0aW9uKCkge1xyXG5cdFx0XHRcdFx0XHRzZWxmLlN0YXR1cyA9ICdzaG93bic7XHJcblx0XHRcdFx0XHRcdFxyXG5cdFx0XHRcdFx0XHQvLyB0cmlnZ2VyIGFueSBzaG93IG1ldGhvZCBjdXN0b20gY2FsbGJhY2tzIGFuZCByZXNldCB0aGVtXHJcblx0XHRcdFx0XHRcdCQuZWFjaChzZWxmLmNhbGxiYWNrcy5zaG93LCBmdW5jdGlvbihpLGMpIHsgYy5jYWxsKHNlbGYuJGVsKTsgfSk7XHJcblx0XHRcdFx0XHRcdHNlbGYuY2FsbGJhY2tzLnNob3cgPSBbXTtcclxuXHRcdFx0XHRcdH07XHJcblx0XHRcdFx0XHRcclxuXHRcdFx0XHRcdC8vIGlmIHRoaXMgb3JpZ2luIGFscmVhZHkgaGFzIGl0cyB0b29sdGlwIG9wZW5cclxuXHRcdFx0XHRcdGlmIChzZWxmLlN0YXR1cyAhPT0gJ2hpZGRlbicpIHtcclxuXHRcdFx0XHRcdFx0XHJcblx0XHRcdFx0XHRcdC8vIHRoZSB0aW1lciAoaWYgYW55KSB3aWxsIHN0YXJ0IChvciByZXN0YXJ0KSByaWdodCBub3dcclxuXHRcdFx0XHRcdFx0dmFyIGV4dHJhVGltZSA9IDA7XHJcblx0XHRcdFx0XHRcdFxyXG5cdFx0XHRcdFx0XHQvLyBpZiBpdCB3YXMgZGlzYXBwZWFyaW5nLCBjYW5jZWwgdGhhdFxyXG5cdFx0XHRcdFx0XHRpZiAoc2VsZi5TdGF0dXMgPT09ICdkaXNhcHBlYXJpbmcnKSB7XHJcblx0XHRcdFx0XHRcdFx0XHJcblx0XHRcdFx0XHRcdFx0c2VsZi5TdGF0dXMgPSAnYXBwZWFyaW5nJztcclxuXHRcdFx0XHRcdFx0XHRcclxuXHRcdFx0XHRcdFx0XHRpZiAoc3VwcG9ydHNUcmFuc2l0aW9ucygpKSB7XHJcblx0XHRcdFx0XHRcdFx0XHRcclxuXHRcdFx0XHRcdFx0XHRcdHNlbGYuJHRvb2x0aXBcclxuXHRcdFx0XHRcdFx0XHRcdFx0LmNsZWFyUXVldWUoKVxyXG5cdFx0XHRcdFx0XHRcdFx0XHQucmVtb3ZlQ2xhc3MoJ3Rvb2x0aXBzdGVyLWR5aW5nJylcclxuXHRcdFx0XHRcdFx0XHRcdFx0LmFkZENsYXNzKCd0b29sdGlwc3Rlci0nKyBzZWxmLm9wdGlvbnMuYW5pbWF0aW9uICsnLXNob3cnKTtcclxuXHRcdFx0XHRcdFx0XHRcdFxyXG5cdFx0XHRcdFx0XHRcdFx0aWYgKHNlbGYub3B0aW9ucy5zcGVlZCA+IDApIHNlbGYuJHRvb2x0aXAuZGVsYXkoc2VsZi5vcHRpb25zLnNwZWVkKTtcclxuXHRcdFx0XHRcdFx0XHRcdFxyXG5cdFx0XHRcdFx0XHRcdFx0c2VsZi4kdG9vbHRpcC5xdWV1ZShmaW5pc2gpO1xyXG5cdFx0XHRcdFx0XHRcdH1cclxuXHRcdFx0XHRcdFx0XHRlbHNlIHtcclxuXHRcdFx0XHRcdFx0XHRcdC8vIGluIGNhc2UgdGhlIHRvb2x0aXAgd2FzIGN1cnJlbnRseSBmYWRpbmcgb3V0LCBicmluZyBpdCBiYWNrIHRvIGxpZmVcclxuXHRcdFx0XHRcdFx0XHRcdHNlbGYuJHRvb2x0aXBcclxuXHRcdFx0XHRcdFx0XHRcdFx0LnN0b3AoKVxyXG5cdFx0XHRcdFx0XHRcdFx0XHQuZmFkZUluKGZpbmlzaCk7XHJcblx0XHRcdFx0XHRcdFx0fVxyXG5cdFx0XHRcdFx0XHR9XHJcblx0XHRcdFx0XHRcdC8vIGlmIHRoZSB0b29sdGlwIGlzIGFscmVhZHkgb3Blbiwgd2Ugc3RpbGwgbmVlZCB0byB0cmlnZ2VyIHRoZSBtZXRob2QgY3VzdG9tIGNhbGxiYWNrXHJcblx0XHRcdFx0XHRcdGVsc2UgaWYoc2VsZi5TdGF0dXMgPT09ICdzaG93bicpIHtcclxuXHRcdFx0XHRcdFx0XHRmaW5pc2goKTtcclxuXHRcdFx0XHRcdFx0fVxyXG5cdFx0XHRcdFx0fVxyXG5cdFx0XHRcdFx0Ly8gaWYgdGhlIHRvb2x0aXAgaXNuJ3QgYWxyZWFkeSBvcGVuLCBvcGVuIHRoYXQgc3Vja2VyIHVwIVxyXG5cdFx0XHRcdFx0ZWxzZSB7XHJcblx0XHRcdFx0XHRcdFxyXG5cdFx0XHRcdFx0XHRzZWxmLlN0YXR1cyA9ICdhcHBlYXJpbmcnO1xyXG5cdFx0XHRcdFx0XHRcclxuXHRcdFx0XHRcdFx0Ly8gdGhlIHRpbWVyIChpZiBhbnkpIHdpbGwgc3RhcnQgd2hlbiB0aGUgdG9vbHRpcCBoYXMgZnVsbHkgYXBwZWFyZWQgYWZ0ZXIgaXRzIHRyYW5zaXRpb25cclxuXHRcdFx0XHRcdFx0dmFyIGV4dHJhVGltZSA9IHNlbGYub3B0aW9ucy5zcGVlZDtcclxuXHRcdFx0XHRcdFx0XHJcblx0XHRcdFx0XHRcdC8vIGRpc2FibGUgaG9yaXpvbnRhbCBzY3JvbGxiYXIgdG8ga2VlcCBvdmVyZmxvd2luZyB0b29sdGlwcyBmcm9tIGphY2tpbmcgd2l0aCBpdCBhbmQgdGhlbiByZXN0b3JlIGl0IHRvIGl0cyBwcmV2aW91cyB2YWx1ZVxyXG5cdFx0XHRcdFx0XHRzZWxmLmJvZHlPdmVyZmxvd1ggPSAkKCdib2R5JykuY3NzKCdvdmVyZmxvdy14Jyk7XHJcblx0XHRcdFx0XHRcdCQoJ2JvZHknKS5jc3MoJ292ZXJmbG93LXgnLCAnaGlkZGVuJyk7XHJcblx0XHRcdFx0XHRcdFxyXG5cdFx0XHRcdFx0XHQvLyBnZXQgc29tZSBvdGhlciBzZXR0aW5ncyByZWxhdGVkIHRvIGJ1aWxkaW5nIHRoZSB0b29sdGlwXHJcblx0XHRcdFx0XHRcdHZhciBhbmltYXRpb24gPSAndG9vbHRpcHN0ZXItJyArIHNlbGYub3B0aW9ucy5hbmltYXRpb24sXHJcblx0XHRcdFx0XHRcdFx0YW5pbWF0aW9uU3BlZWQgPSAnLXdlYmtpdC10cmFuc2l0aW9uLWR1cmF0aW9uOiAnKyBzZWxmLm9wdGlvbnMuc3BlZWQgKydtczsgLXdlYmtpdC1hbmltYXRpb24tZHVyYXRpb246ICcrIHNlbGYub3B0aW9ucy5zcGVlZCArJ21zOyAtbW96LXRyYW5zaXRpb24tZHVyYXRpb246ICcrIHNlbGYub3B0aW9ucy5zcGVlZCArJ21zOyAtbW96LWFuaW1hdGlvbi1kdXJhdGlvbjogJysgc2VsZi5vcHRpb25zLnNwZWVkICsnbXM7IC1vLXRyYW5zaXRpb24tZHVyYXRpb246ICcrIHNlbGYub3B0aW9ucy5zcGVlZCArJ21zOyAtby1hbmltYXRpb24tZHVyYXRpb246ICcrIHNlbGYub3B0aW9ucy5zcGVlZCArJ21zOyAtbXMtdHJhbnNpdGlvbi1kdXJhdGlvbjogJysgc2VsZi5vcHRpb25zLnNwZWVkICsnbXM7IC1tcy1hbmltYXRpb24tZHVyYXRpb246ICcrIHNlbGYub3B0aW9ucy5zcGVlZCArJ21zOyB0cmFuc2l0aW9uLWR1cmF0aW9uOiAnKyBzZWxmLm9wdGlvbnMuc3BlZWQgKydtczsgYW5pbWF0aW9uLWR1cmF0aW9uOiAnKyBzZWxmLm9wdGlvbnMuc3BlZWQgKydtczsnLFxyXG5cdFx0XHRcdFx0XHRcdG1pbldpZHRoID0gc2VsZi5vcHRpb25zLm1pbldpZHRoID8gJ21pbi13aWR0aDonKyBNYXRoLnJvdW5kKHNlbGYub3B0aW9ucy5taW5XaWR0aCkgKydweDsnIDogJycsXHJcblx0XHRcdFx0XHRcdFx0bWF4V2lkdGggPSBzZWxmLm9wdGlvbnMubWF4V2lkdGggPyAnbWF4LXdpZHRoOicrIE1hdGgucm91bmQoc2VsZi5vcHRpb25zLm1heFdpZHRoKSArJ3B4OycgOiAnJyxcclxuXHRcdFx0XHRcdFx0XHRwb2ludGVyRXZlbnRzID0gc2VsZi5vcHRpb25zLmludGVyYWN0aXZlID8gJ3BvaW50ZXItZXZlbnRzOiBhdXRvOycgOiAnJztcclxuXHRcdFx0XHRcdFx0XHJcblx0XHRcdFx0XHRcdC8vIGJ1aWxkIHRoZSBiYXNlIG9mIG91ciB0b29sdGlwXHJcblx0XHRcdFx0XHRcdHNlbGYuJHRvb2x0aXAgPSAkKCc8ZGl2IGNsYXNzPVwidG9vbHRpcHN0ZXItYmFzZSAnKyBzZWxmLm9wdGlvbnMudGhlbWUgKydcIiBzdHlsZT1cIicrIG1pbldpZHRoICsnICcrIG1heFdpZHRoICsnICcrIHBvaW50ZXJFdmVudHMgKycgJysgYW5pbWF0aW9uU3BlZWQgKydcIj48ZGl2IGNsYXNzPVwidG9vbHRpcHN0ZXItY29udGVudFwiPjwvZGl2PjwvZGl2PicpO1xyXG5cdFx0XHRcdFx0XHRcclxuXHRcdFx0XHRcdFx0Ly8gb25seSBhZGQgdGhlIGFuaW1hdGlvbiBjbGFzcyBpZiB0aGUgdXNlciBoYXMgYSBicm93c2VyIHRoYXQgc3VwcG9ydHMgYW5pbWF0aW9uc1xyXG5cdFx0XHRcdFx0XHRpZiAoc3VwcG9ydHNUcmFuc2l0aW9ucygpKSBzZWxmLiR0b29sdGlwLmFkZENsYXNzKGFuaW1hdGlvbik7XHJcblx0XHRcdFx0XHRcdFxyXG5cdFx0XHRcdFx0XHQvLyBpbnNlcnQgdGhlIGNvbnRlbnRcclxuXHRcdFx0XHRcdFx0c2VsZi5fY29udGVudF9pbnNlcnQoKTtcclxuXHRcdFx0XHRcdFx0XHJcblx0XHRcdFx0XHRcdC8vIGF0dGFjaFxyXG5cdFx0XHRcdFx0XHRzZWxmLiR0b29sdGlwLmFwcGVuZFRvKCdib2R5Jyk7XHJcblx0XHRcdFx0XHRcdFxyXG5cdFx0XHRcdFx0XHQvLyBkbyBhbGwgdGhlIGNyYXp5IGNhbGN1bGF0aW9ucyBhbmQgcG9zaXRpb25pbmdcclxuXHRcdFx0XHRcdFx0c2VsZi5yZXBvc2l0aW9uKCk7XHJcblx0XHRcdFx0XHRcdFxyXG5cdFx0XHRcdFx0XHQvLyBjYWxsIG91ciBjdXN0b20gY2FsbGJhY2sgc2luY2UgdGhlIGNvbnRlbnQgb2YgdGhlIHRvb2x0aXAgaXMgbm93IHBhcnQgb2YgdGhlIERPTVxyXG5cdFx0XHRcdFx0XHRzZWxmLm9wdGlvbnMuZnVuY3Rpb25SZWFkeS5jYWxsKHNlbGYuJGVsLCBzZWxmLiRlbCwgc2VsZi4kdG9vbHRpcCk7XHJcblx0XHRcdFx0XHRcdFxyXG5cdFx0XHRcdFx0XHQvLyBhbmltYXRlIGluIHRoZSB0b29sdGlwXHJcblx0XHRcdFx0XHRcdGlmIChzdXBwb3J0c1RyYW5zaXRpb25zKCkpIHtcclxuXHRcdFx0XHRcdFx0XHRcclxuXHRcdFx0XHRcdFx0XHRzZWxmLiR0b29sdGlwLmFkZENsYXNzKGFuaW1hdGlvbiArICctc2hvdycpO1xyXG5cdFx0XHRcdFx0XHRcdFxyXG5cdFx0XHRcdFx0XHRcdGlmKHNlbGYub3B0aW9ucy5zcGVlZCA+IDApIHNlbGYuJHRvb2x0aXAuZGVsYXkoc2VsZi5vcHRpb25zLnNwZWVkKTtcclxuXHRcdFx0XHRcdFx0XHRcclxuXHRcdFx0XHRcdFx0XHRzZWxmLiR0b29sdGlwLnF1ZXVlKGZpbmlzaCk7XHJcblx0XHRcdFx0XHRcdH1cclxuXHRcdFx0XHRcdFx0ZWxzZSB7XHJcblx0XHRcdFx0XHRcdFx0c2VsZi4kdG9vbHRpcC5jc3MoJ2Rpc3BsYXknLCAnbm9uZScpLmZhZGVJbihzZWxmLm9wdGlvbnMuc3BlZWQsIGZpbmlzaCk7XHJcblx0XHRcdFx0XHRcdH1cclxuXHRcdFx0XHRcdFx0XHJcblx0XHRcdFx0XHRcdC8vIHdpbGwgY2hlY2sgaWYgb3VyIHRvb2x0aXAgb3JpZ2luIGlzIHJlbW92ZWQgd2hpbGUgdGhlIHRvb2x0aXAgaXMgc2hvd25cclxuXHRcdFx0XHRcdFx0c2VsZi5faW50ZXJ2YWxfc2V0KCk7XHJcblx0XHRcdFx0XHRcdFxyXG5cdFx0XHRcdFx0XHQvLyByZXBvc2l0aW9uIG9uIHNjcm9sbCAob3RoZXJ3aXNlIHBvc2l0aW9uOmZpeGVkIGVsZW1lbnQncyB0b29sdGlwcyB3aWxsIG1vdmUgYXdheSBmb3JtIHRoZWlyIG9yaWdpbikgYW5kIG9uIHJlc2l6ZSAoaW4gY2FzZSBwb3NpdGlvbiBjYW4vaGFzIHRvIGJlIGNoYW5nZWQpXHJcblx0XHRcdFx0XHRcdCQod2luZG93KS5vbignc2Nyb2xsLicrIHNlbGYubmFtZXNwYWNlICsnIHJlc2l6ZS4nKyBzZWxmLm5hbWVzcGFjZSwgZnVuY3Rpb24oKSB7XHJcblx0XHRcdFx0XHRcdFx0c2VsZi5yZXBvc2l0aW9uKCk7XHJcblx0XHRcdFx0XHRcdH0pO1xyXG5cdFx0XHRcdFx0XHRcclxuXHRcdFx0XHRcdFx0Ly8gYXV0by1jbG9zZSBiaW5kaW5nc1xyXG5cdFx0XHRcdFx0XHRpZiAoc2VsZi5vcHRpb25zLmF1dG9DbG9zZSkge1xyXG5cdFx0XHRcdFx0XHRcdFxyXG5cdFx0XHRcdFx0XHRcdC8vIGluIGNhc2UgYSBsaXN0ZW5lciBpcyBhbHJlYWR5IGJvdW5kIGZvciBhdXRvY2xvc2luZyAobW91c2Ugb3IgdG91Y2gsIGhvdmVyIG9yIGNsaWNrKSwgdW5iaW5kIGl0IGZpcnN0XHJcblx0XHRcdFx0XHRcdFx0JCgnYm9keScpLm9mZignLicrIHNlbGYubmFtZXNwYWNlKTtcclxuXHRcdFx0XHRcdFx0XHRcclxuXHRcdFx0XHRcdFx0XHQvLyBoZXJlIHdlJ2xsIGhhdmUgdG8gc2V0IGRpZmZlcmVudCBzZXRzIG9mIGJpbmRpbmdzIGZvciBib3RoIHRvdWNoIGFuZCBtb3VzZVxyXG5cdFx0XHRcdFx0XHRcdGlmIChzZWxmLm9wdGlvbnMudHJpZ2dlciA9PSAnaG92ZXInKSB7XHJcblx0XHRcdFx0XHRcdFx0XHRcclxuXHRcdFx0XHRcdFx0XHRcdC8vIGlmIHRoZSB1c2VyIHRvdWNoZXMgdGhlIGJvZHksIGhpZGVcclxuXHRcdFx0XHRcdFx0XHRcdGlmIChkZXZpY2VIYXNUb3VjaENhcGFiaWxpdHkpIHtcclxuXHRcdFx0XHRcdFx0XHRcdFx0Ly8gdGltZW91dCAwIDogZXhwbGFuYXRpb24gYmVsb3cgaW4gY2xpY2sgc2VjdGlvblxyXG5cdFx0XHRcdFx0XHRcdFx0XHRzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xyXG5cdFx0XHRcdFx0XHRcdFx0XHRcdC8vIHdlIGRvbid0IHdhbnQgdG8gYmluZCBvbiBjbGljayBoZXJlIGJlY2F1c2UgdGhlIGluaXRpYWwgdG91Y2hzdGFydCBldmVudCBoYXMgbm90IHlldCB0cmlnZ2VyZWQgaXRzIGNsaWNrIGV2ZW50LCB3aGljaCBpcyB0aHVzIGFib3V0IHRvIGhhcHBlblxyXG5cdFx0XHRcdFx0XHRcdFx0XHRcdCQoJ2JvZHknKS5vbigndG91Y2hzdGFydC4nKyBzZWxmLm5hbWVzcGFjZSwgZnVuY3Rpb24oKSB7XHJcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRzZWxmLmhpZGUoKTtcclxuXHRcdFx0XHRcdFx0XHRcdFx0XHR9KTtcclxuXHRcdFx0XHRcdFx0XHRcdFx0fSwgMCk7XHJcblx0XHRcdFx0XHRcdFx0XHR9XHJcblx0XHRcdFx0XHRcdFx0XHRcclxuXHRcdFx0XHRcdFx0XHRcdC8vIGlmIHdlIGhhdmUgdG8gYWxsb3cgaW50ZXJhY3Rpb25cclxuXHRcdFx0XHRcdFx0XHRcdGlmIChzZWxmLm9wdGlvbnMuaW50ZXJhY3RpdmUpIHtcclxuXHRcdFx0XHRcdFx0XHRcdFx0XHJcblx0XHRcdFx0XHRcdFx0XHRcdC8vIHRvdWNoIGV2ZW50cyBpbnNpZGUgdGhlIHRvb2x0aXAgbXVzdCBub3QgY2xvc2UgaXRcclxuXHRcdFx0XHRcdFx0XHRcdFx0aWYgKGRldmljZUhhc1RvdWNoQ2FwYWJpbGl0eSkge1xyXG5cdFx0XHRcdFx0XHRcdFx0XHRcdHNlbGYuJHRvb2x0aXAub24oJ3RvdWNoc3RhcnQuJysgc2VsZi5uYW1lc3BhY2UsIGZ1bmN0aW9uKGV2ZW50KSB7XHJcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRldmVudC5zdG9wUHJvcGFnYXRpb24oKTtcclxuXHRcdFx0XHRcdFx0XHRcdFx0XHR9KTtcclxuXHRcdFx0XHRcdFx0XHRcdFx0fVxyXG5cdFx0XHRcdFx0XHRcdFx0XHRcclxuXHRcdFx0XHRcdFx0XHRcdFx0Ly8gYXMgZm9yIG1vdXNlIGludGVyYWN0aW9uLCB3ZSBnZXQgcmlkIG9mIHRoZSB0b29sdGlwIG9ubHkgYWZ0ZXIgdGhlIG1vdXNlIGhhcyBzcGVudCBzb21lIHRpbWUgb3V0IG9mIGl0XHJcblx0XHRcdFx0XHRcdFx0XHRcdHZhciB0b2xlcmFuY2UgPSBudWxsO1xyXG5cdFx0XHRcdFx0XHRcdFx0XHRcclxuXHRcdFx0XHRcdFx0XHRcdFx0c2VsZi4kZWxQcm94eS5hZGQoc2VsZi4kdG9vbHRpcClcclxuXHRcdFx0XHRcdFx0XHRcdFx0XHQvLyBoaWRlIGFmdGVyIHNvbWUgdGltZSBvdXQgb2YgdGhlIHByb3h5IGFuZCB0aGUgdG9vbHRpcFxyXG5cdFx0XHRcdFx0XHRcdFx0XHRcdC5vbignbW91c2VsZWF2ZS4nKyBzZWxmLm5hbWVzcGFjZSArICctYXV0b0Nsb3NlJywgZnVuY3Rpb24oKSB7XHJcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRjbGVhclRpbWVvdXQodG9sZXJhbmNlKTtcclxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdHRvbGVyYW5jZSA9IHNldFRpbWVvdXQoZnVuY3Rpb24oKXtcclxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0c2VsZi5oaWRlKCk7XHJcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHR9LCBzZWxmLm9wdGlvbnMuaW50ZXJhY3RpdmVUb2xlcmFuY2UpO1xyXG5cdFx0XHRcdFx0XHRcdFx0XHRcdH0pXHJcblx0XHRcdFx0XHRcdFx0XHRcdFx0Ly8gc3VzcGVuZCB0aW1lb3V0IHdoZW4gdGhlIG1vdXNlIGlzIG92ZXIgdGhlIHByb3h5IG9yIHRoZSB0b29sdGlwXHJcblx0XHRcdFx0XHRcdFx0XHRcdFx0Lm9uKCdtb3VzZWVudGVyLicrIHNlbGYubmFtZXNwYWNlICsgJy1hdXRvQ2xvc2UnLCBmdW5jdGlvbigpIHtcclxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdGNsZWFyVGltZW91dCh0b2xlcmFuY2UpO1xyXG5cdFx0XHRcdFx0XHRcdFx0XHRcdH0pO1xyXG5cdFx0XHRcdFx0XHRcdFx0fVxyXG5cdFx0XHRcdFx0XHRcdFx0Ly8gaWYgdGhpcyBpcyBhIG5vbi1pbnRlcmFjdGl2ZSB0b29sdGlwLCBnZXQgcmlkIG9mIGl0IGlmIHRoZSBtb3VzZSBsZWF2ZXNcclxuXHRcdFx0XHRcdFx0XHRcdGVsc2Uge1xyXG5cdFx0XHRcdFx0XHRcdFx0XHRzZWxmLiRlbFByb3h5Lm9uKCdtb3VzZWxlYXZlLicrIHNlbGYubmFtZXNwYWNlICsgJy1hdXRvQ2xvc2UnLCBmdW5jdGlvbigpIHtcclxuXHRcdFx0XHRcdFx0XHRcdFx0XHRzZWxmLmhpZGUoKTtcclxuXHRcdFx0XHRcdFx0XHRcdFx0fSk7XHJcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0XG5cdFx0XHRcdFx0XHRcdFx0Ly8gY2xvc2UgdGhlIHRvb2x0aXAgd2hlbiB0aGUgcHJveHkgZ2V0cyBhIGNsaWNrIChjb21tb24gYmVoYXZpb3Igb2YgbmF0aXZlIHRvb2x0aXBzKVxuXHRcdFx0XHRcdFx0XHRcdGlmIChzZWxmLm9wdGlvbnMuaGlkZU9uQ2xpY2spIHtcblx0XHRcdFx0XHRcdFx0XHRcdFxuXHRcdFx0XHRcdFx0XHRcdFx0c2VsZi4kZWxQcm94eS5vbignY2xpY2suJysgc2VsZi5uYW1lc3BhY2UgKyAnLWF1dG9DbG9zZScsIGZ1bmN0aW9uKCkge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRzZWxmLmhpZGUoKTtcblx0XHRcdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0XHRcdH1cclxuXHRcdFx0XHRcdFx0XHR9XHJcblx0XHRcdFx0XHRcdFx0Ly8gaGVyZSB3ZSdsbCBzZXQgdGhlIHNhbWUgYmluZGluZ3MgZm9yIGJvdGggY2xpY2tzIGFuZCB0b3VjaCBvbiB0aGUgYm9keSB0byBoaWRlIHRoZSB0b29sdGlwXHJcblx0XHRcdFx0XHRcdFx0ZWxzZSBpZihzZWxmLm9wdGlvbnMudHJpZ2dlciA9PSAnY2xpY2snKXtcclxuXHRcdFx0XHRcdFx0XHRcdFxyXG5cdFx0XHRcdFx0XHRcdFx0Ly8gdXNlIGEgdGltZW91dCB0byBwcmV2ZW50IGltbWVkaWF0ZSBjbG9zaW5nIGlmIHRoZSBtZXRob2Qgd2FzIGNhbGxlZCBvbiBhIGNsaWNrIGV2ZW50IGFuZCBpZiBvcHRpb25zLmRlbGF5ID09IDAgKGJlY2F1c2Ugb2YgYnViYmxpbmcpXHJcblx0XHRcdFx0XHRcdFx0XHRzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xyXG5cdFx0XHRcdFx0XHRcdFx0XHQkKCdib2R5Jykub24oJ2NsaWNrLicrIHNlbGYubmFtZXNwYWNlICsnIHRvdWNoc3RhcnQuJysgc2VsZi5uYW1lc3BhY2UsIGZ1bmN0aW9uKCkge1xyXG5cdFx0XHRcdFx0XHRcdFx0XHRcdHNlbGYuaGlkZSgpO1xyXG5cdFx0XHRcdFx0XHRcdFx0XHR9KTtcclxuXHRcdFx0XHRcdFx0XHRcdH0sIDApO1xyXG5cdFx0XHRcdFx0XHRcdFx0XHJcblx0XHRcdFx0XHRcdFx0XHQvLyBpZiBpbnRlcmFjdGl2ZSwgd2UnbGwgc3RvcCB0aGUgZXZlbnRzIHRoYXQgd2VyZSBlbWl0dGVkIGZyb20gaW5zaWRlIHRoZSB0b29sdGlwIHRvIHN0b3AgYXV0b0Nsb3NpbmdcclxuXHRcdFx0XHRcdFx0XHRcdGlmIChzZWxmLm9wdGlvbnMuaW50ZXJhY3RpdmUpIHtcclxuXHRcdFx0XHRcdFx0XHRcdFx0XHJcblx0XHRcdFx0XHRcdFx0XHRcdC8vIG5vdGUgOiB0aGUgdG91Y2ggZXZlbnRzIHdpbGwganVzdCBub3QgYmUgdXNlZCBpZiB0aGUgcGx1Z2luIGlzIG5vdCBlbmFibGVkIG9uIHRvdWNoIGRldmljZXNcclxuXHRcdFx0XHRcdFx0XHRcdFx0c2VsZi4kdG9vbHRpcC5vbignY2xpY2suJysgc2VsZi5uYW1lc3BhY2UgKycgdG91Y2hzdGFydC4nKyBzZWxmLm5hbWVzcGFjZSwgZnVuY3Rpb24oZXZlbnQpIHtcclxuXHRcdFx0XHRcdFx0XHRcdFx0XHRldmVudC5zdG9wUHJvcGFnYXRpb24oKTtcclxuXHRcdFx0XHRcdFx0XHRcdFx0fSk7XHJcblx0XHRcdFx0XHRcdFx0XHR9XHJcblx0XHRcdFx0XHRcdFx0fVxyXG5cdFx0XHRcdFx0XHR9XHJcblx0XHRcdFx0XHR9XHJcblx0XHRcdFx0XHRcclxuXHRcdFx0XHRcdC8vIGlmIHdlIGhhdmUgYSB0aW1lciBzZXQsIGxldCB0aGUgY291bnRkb3duIGJlZ2luXHJcblx0XHRcdFx0XHRpZiAoc2VsZi5vcHRpb25zLnRpbWVyID4gMCkge1xyXG5cdFx0XHRcdFx0XHRcclxuXHRcdFx0XHRcdFx0c2VsZi50aW1lckhpZGUgPSBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xyXG5cdFx0XHRcdFx0XHRcdHNlbGYudGltZXJIaWRlID0gbnVsbDtcclxuXHRcdFx0XHRcdFx0XHRzZWxmLmhpZGUoKTtcclxuXHRcdFx0XHRcdFx0fSwgc2VsZi5vcHRpb25zLnRpbWVyICsgZXh0cmFUaW1lKTtcclxuXHRcdFx0XHRcdH1cclxuXHRcdFx0XHR9XHJcblx0XHRcdH0pO1xyXG5cdFx0fSxcclxuXHRcdFxyXG5cdFx0X2ludGVydmFsX3NldDogZnVuY3Rpb24oKSB7XHJcblx0XHRcdFxyXG5cdFx0XHR2YXIgc2VsZiA9IHRoaXM7XHJcblx0XHRcdFxyXG5cdFx0XHRzZWxmLmNoZWNrSW50ZXJ2YWwgPSBzZXRJbnRlcnZhbChmdW5jdGlvbigpIHtcclxuXHRcdFx0XHRcclxuXHRcdFx0XHQvLyBpZiB0aGUgdG9vbHRpcCBhbmQvb3IgaXRzIGludGVydmFsIHNob3VsZCBiZSBzdG9wcGVkXHJcblx0XHRcdFx0aWYgKFxyXG5cdFx0XHRcdFx0XHQvLyBpZiB0aGUgb3JpZ2luIGhhcyBiZWVuIHJlbW92ZWRcclxuXHRcdFx0XHRcdFx0JCgnYm9keScpLmZpbmQoc2VsZi4kZWwpLmxlbmd0aCA9PT0gMFxyXG5cdFx0XHRcdFx0XHQvLyBpZiB0aGUgZWxQcm94eSBoYXMgYmVlbiByZW1vdmVkXHJcblx0XHRcdFx0XHR8fFx0JCgnYm9keScpLmZpbmQoc2VsZi4kZWxQcm94eSkubGVuZ3RoID09PSAwXHJcblx0XHRcdFx0XHRcdC8vIGlmIHRoZSB0b29sdGlwIGhhcyBiZWVuIGNsb3NlZFxyXG5cdFx0XHRcdFx0fHxcdHNlbGYuU3RhdHVzID09ICdoaWRkZW4nXHJcblx0XHRcdFx0XHRcdC8vIGlmIHRoZSB0b29sdGlwIGhhcyBzb21laG93IGJlZW4gcmVtb3ZlZFxyXG5cdFx0XHRcdFx0fHxcdCQoJ2JvZHknKS5maW5kKHNlbGYuJHRvb2x0aXApLmxlbmd0aCA9PT0gMFxyXG5cdFx0XHRcdCkge1xyXG5cdFx0XHRcdFx0Ly8gcmVtb3ZlIHRoZSB0b29sdGlwIGlmIGl0J3Mgc3RpbGwgaGVyZVxyXG5cdFx0XHRcdFx0aWYgKHNlbGYuU3RhdHVzID09ICdzaG93bicgfHwgc2VsZi5TdGF0dXMgPT0gJ2FwcGVhcmluZycpIHNlbGYuaGlkZSgpO1xyXG5cdFx0XHRcdFx0XHJcblx0XHRcdFx0XHQvLyBjbGVhciB0aGlzIGludGVydmFsIGFzIGl0IGlzIG5vIGxvbmdlciBuZWNlc3NhcnlcclxuXHRcdFx0XHRcdHNlbGYuX2ludGVydmFsX2NhbmNlbCgpO1xyXG5cdFx0XHRcdH1cclxuXHRcdFx0XHQvLyBpZiBldmVyeXRoaW5nIGlzIGFscmlnaHRcclxuXHRcdFx0XHRlbHNlIHtcclxuXHRcdFx0XHRcdC8vIGNvbXBhcmUgdGhlIGZvcm1lciBhbmQgY3VycmVudCBwb3NpdGlvbnMgb2YgdGhlIGVsUHJveHkgdG8gcmVwb3NpdGlvbiB0aGUgdG9vbHRpcCBpZiBuZWVkIGJlXHJcblx0XHRcdFx0XHRpZihzZWxmLm9wdGlvbnMucG9zaXRpb25UcmFja2VyKXtcclxuXHRcdFx0XHRcdFx0XHJcblx0XHRcdFx0XHRcdHZhciBwID0gc2VsZi5fcmVwb3NpdGlvbkluZm8oc2VsZi4kZWxQcm94eSksXHJcblx0XHRcdFx0XHRcdFx0aWRlbnRpY2FsID0gZmFsc2U7XHJcblx0XHRcdFx0XHRcdFxyXG5cdFx0XHRcdFx0XHQvLyBjb21wYXJlIHNpemUgZmlyc3QgKGEgY2hhbmdlIHJlcXVpcmVzIHJlcG9zaXRpb25pbmcgdG9vKVxyXG5cdFx0XHRcdFx0XHRpZihhcmVFcXVhbChwLmRpbWVuc2lvbiwgc2VsZi5lbFByb3h5UG9zaXRpb24uZGltZW5zaW9uKSl7XHJcblx0XHRcdFx0XHRcdFx0XHJcblx0XHRcdFx0XHRcdFx0Ly8gZm9yIGVsZW1lbnRzIHdpdGggYSBmaXhlZCBwb3NpdGlvbiwgd2UgdHJhY2sgdGhlIHRvcCBhbmQgbGVmdCBwcm9wZXJ0aWVzIChyZWxhdGl2ZSB0byB3aW5kb3cpXHJcblx0XHRcdFx0XHRcdFx0aWYoc2VsZi4kZWxQcm94eS5jc3MoJ3Bvc2l0aW9uJykgPT09ICdmaXhlZCcpe1xyXG5cdFx0XHRcdFx0XHRcdFx0aWYoYXJlRXF1YWwocC5wb3NpdGlvbiwgc2VsZi5lbFByb3h5UG9zaXRpb24ucG9zaXRpb24pKSBpZGVudGljYWwgPSB0cnVlO1xyXG5cdFx0XHRcdFx0XHRcdH1cclxuXHRcdFx0XHRcdFx0XHQvLyBvdGhlcndpc2UsIHRyYWNrIHRvdGFsIG9mZnNldCAocmVsYXRpdmUgdG8gZG9jdW1lbnQpXHJcblx0XHRcdFx0XHRcdFx0ZWxzZSB7XHJcblx0XHRcdFx0XHRcdFx0XHRpZihhcmVFcXVhbChwLm9mZnNldCwgc2VsZi5lbFByb3h5UG9zaXRpb24ub2Zmc2V0KSkgaWRlbnRpY2FsID0gdHJ1ZTtcclxuXHRcdFx0XHRcdFx0XHR9XHJcblx0XHRcdFx0XHRcdH1cclxuXHRcdFx0XHRcdFx0XHJcblx0XHRcdFx0XHRcdGlmKCFpZGVudGljYWwpe1xyXG5cdFx0XHRcdFx0XHRcdHNlbGYucmVwb3NpdGlvbigpO1xuXHRcdFx0XHRcdFx0XHRzZWxmLm9wdGlvbnMucG9zaXRpb25UcmFja2VyQ2FsbGJhY2suY2FsbChzZWxmLCBzZWxmLiRlbCk7XHJcblx0XHRcdFx0XHRcdH1cclxuXHRcdFx0XHRcdH1cclxuXHRcdFx0XHR9XHJcblx0XHRcdH0sIDIwMCk7XHJcblx0XHR9LFxyXG5cdFx0XHJcblx0XHRfaW50ZXJ2YWxfY2FuY2VsOiBmdW5jdGlvbigpIHtcclxuXHRcdFx0Y2xlYXJJbnRlcnZhbCh0aGlzLmNoZWNrSW50ZXJ2YWwpO1xyXG5cdFx0XHQvLyBjbGVhbiBkZWxldGVcclxuXHRcdFx0dGhpcy5jaGVja0ludGVydmFsID0gbnVsbDtcclxuXHRcdH0sXHJcblx0XHRcclxuXHRcdF9jb250ZW50X3NldDogZnVuY3Rpb24oY29udGVudCkge1xyXG5cdFx0XHQvLyBjbG9uZSBpZiBhc2tlZC4gQ2xvbmluZyB0aGUgb2JqZWN0IG1ha2VzIHN1cmUgdGhhdCBlYWNoIGluc3RhbmNlIGhhcyBpdHMgb3duIHZlcnNpb24gb2YgdGhlIGNvbnRlbnQgKGluIGNhc2UgYSBzYW1lIG9iamVjdCB3ZXJlIHByb3ZpZGVkIGZvciBzZXZlcmFsIGluc3RhbmNlcylcclxuXHRcdFx0Ly8gcmVtaW5kZXIgOiB0eXBlb2YgbnVsbCA9PT0gb2JqZWN0XHJcblx0XHRcdGlmICh0eXBlb2YgY29udGVudCA9PT0gJ29iamVjdCcgJiYgY29udGVudCAhPT0gbnVsbCAmJiB0aGlzLm9wdGlvbnMuY29udGVudENsb25pbmcpIHtcclxuXHRcdFx0XHRjb250ZW50ID0gY29udGVudC5jbG9uZSh0cnVlKTtcclxuXHRcdFx0fVxyXG5cdFx0XHR0aGlzLkNvbnRlbnQgPSBjb250ZW50O1xyXG5cdFx0fSxcclxuXHRcdFxyXG5cdFx0X2NvbnRlbnRfaW5zZXJ0OiBmdW5jdGlvbigpIHtcclxuXHRcdFx0XHJcblx0XHRcdHZhciBzZWxmID0gdGhpcyxcclxuXHRcdFx0XHQkZCA9IHRoaXMuJHRvb2x0aXAuZmluZCgnLnRvb2x0aXBzdGVyLWNvbnRlbnQnKTtcclxuXHRcdFx0XHJcblx0XHRcdGlmICh0eXBlb2Ygc2VsZi5Db250ZW50ID09PSAnc3RyaW5nJyAmJiAhc2VsZi5vcHRpb25zLmNvbnRlbnRBc0hUTUwpIHtcclxuXHRcdFx0XHQkZC50ZXh0KHNlbGYuQ29udGVudCk7XHJcblx0XHRcdH1cclxuXHRcdFx0ZWxzZSB7XHJcblx0XHRcdFx0JGRcclxuXHRcdFx0XHRcdC5lbXB0eSgpXHJcblx0XHRcdFx0XHQuYXBwZW5kKHNlbGYuQ29udGVudCk7XHJcblx0XHRcdH1cclxuXHRcdH0sXHJcblx0XHRcclxuXHRcdF91cGRhdGU6IGZ1bmN0aW9uKGNvbnRlbnQpIHtcclxuXHRcdFx0XHJcblx0XHRcdHZhciBzZWxmID0gdGhpcztcclxuXHRcdFx0XHJcblx0XHRcdC8vIGNoYW5nZSB0aGUgY29udGVudFxyXG5cdFx0XHRzZWxmLl9jb250ZW50X3NldChjb250ZW50KTtcclxuXHRcdFx0XHJcblx0XHRcdGlmIChzZWxmLkNvbnRlbnQgIT09IG51bGwpIHtcclxuXHRcdFx0XHRcclxuXHRcdFx0XHQvLyB1cGRhdGUgdGhlIHRvb2x0aXAgaWYgaXQgaXMgb3BlblxyXG5cdFx0XHRcdGlmIChzZWxmLlN0YXR1cyAhPT0gJ2hpZGRlbicpIHtcclxuXHRcdFx0XHRcdFxyXG5cdFx0XHRcdFx0Ly8gcmVzZXQgdGhlIGNvbnRlbnQgaW4gdGhlIHRvb2x0aXBcclxuXHRcdFx0XHRcdHNlbGYuX2NvbnRlbnRfaW5zZXJ0KCk7XHJcblx0XHRcdFx0XHRcclxuXHRcdFx0XHRcdC8vIHJlcG9zaXRpb24gYW5kIHJlc2l6ZSB0aGUgdG9vbHRpcFxyXG5cdFx0XHRcdFx0c2VsZi5yZXBvc2l0aW9uKCk7XHJcblx0XHRcdFx0XHRcclxuXHRcdFx0XHRcdC8vIGlmIHdlIHdhbnQgdG8gcGxheSBhIGxpdHRsZSBhbmltYXRpb24gc2hvd2luZyB0aGUgY29udGVudCBjaGFuZ2VkXHJcblx0XHRcdFx0XHRpZiAoc2VsZi5vcHRpb25zLnVwZGF0ZUFuaW1hdGlvbikge1xyXG5cdFx0XHRcdFx0XHRcclxuXHRcdFx0XHRcdFx0aWYgKHN1cHBvcnRzVHJhbnNpdGlvbnMoKSkge1xyXG5cdFx0XHRcdFx0XHRcdFxyXG5cdFx0XHRcdFx0XHRcdHNlbGYuJHRvb2x0aXAuY3NzKHtcclxuXHRcdFx0XHRcdFx0XHRcdCd3aWR0aCc6ICcnLFxyXG5cdFx0XHRcdFx0XHRcdFx0Jy13ZWJraXQtdHJhbnNpdGlvbic6ICdhbGwgJyArIHNlbGYub3B0aW9ucy5zcGVlZCArICdtcywgd2lkdGggMG1zLCBoZWlnaHQgMG1zLCBsZWZ0IDBtcywgdG9wIDBtcycsXHJcblx0XHRcdFx0XHRcdFx0XHQnLW1vei10cmFuc2l0aW9uJzogJ2FsbCAnICsgc2VsZi5vcHRpb25zLnNwZWVkICsgJ21zLCB3aWR0aCAwbXMsIGhlaWdodCAwbXMsIGxlZnQgMG1zLCB0b3AgMG1zJyxcclxuXHRcdFx0XHRcdFx0XHRcdCctby10cmFuc2l0aW9uJzogJ2FsbCAnICsgc2VsZi5vcHRpb25zLnNwZWVkICsgJ21zLCB3aWR0aCAwbXMsIGhlaWdodCAwbXMsIGxlZnQgMG1zLCB0b3AgMG1zJyxcclxuXHRcdFx0XHRcdFx0XHRcdCctbXMtdHJhbnNpdGlvbic6ICdhbGwgJyArIHNlbGYub3B0aW9ucy5zcGVlZCArICdtcywgd2lkdGggMG1zLCBoZWlnaHQgMG1zLCBsZWZ0IDBtcywgdG9wIDBtcycsXHJcblx0XHRcdFx0XHRcdFx0XHQndHJhbnNpdGlvbic6ICdhbGwgJyArIHNlbGYub3B0aW9ucy5zcGVlZCArICdtcywgd2lkdGggMG1zLCBoZWlnaHQgMG1zLCBsZWZ0IDBtcywgdG9wIDBtcydcclxuXHRcdFx0XHRcdFx0XHR9KS5hZGRDbGFzcygndG9vbHRpcHN0ZXItY29udGVudC1jaGFuZ2luZycpO1xyXG5cdFx0XHRcdFx0XHRcdFxyXG5cdFx0XHRcdFx0XHRcdC8vIHJlc2V0IHRoZSBDU1MgdHJhbnNpdGlvbnMgYW5kIGZpbmlzaCB0aGUgY2hhbmdlIGFuaW1hdGlvblxyXG5cdFx0XHRcdFx0XHRcdHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XHJcblx0XHRcdFx0XHRcdFx0XHRcclxuXHRcdFx0XHRcdFx0XHRcdGlmKHNlbGYuU3RhdHVzICE9ICdoaWRkZW4nKXtcclxuXHRcdFx0XHRcdFx0XHRcdFx0XHJcblx0XHRcdFx0XHRcdFx0XHRcdHNlbGYuJHRvb2x0aXAucmVtb3ZlQ2xhc3MoJ3Rvb2x0aXBzdGVyLWNvbnRlbnQtY2hhbmdpbmcnKTtcclxuXHRcdFx0XHRcdFx0XHRcdFx0XHJcblx0XHRcdFx0XHRcdFx0XHRcdC8vIGFmdGVyIHRoZSBjaGFuZ2luZyBhbmltYXRpb24gaGFzIGNvbXBsZXRlZCwgcmVzZXQgdGhlIENTUyB0cmFuc2l0aW9uc1xyXG5cdFx0XHRcdFx0XHRcdFx0XHRzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xyXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFxyXG5cdFx0XHRcdFx0XHRcdFx0XHRcdGlmKHNlbGYuU3RhdHVzICE9PSAnaGlkZGVuJyl7XHJcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRzZWxmLiR0b29sdGlwLmNzcyh7XHJcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdCctd2Via2l0LXRyYW5zaXRpb24nOiBzZWxmLm9wdGlvbnMuc3BlZWQgKyAnbXMnLFxyXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQnLW1vei10cmFuc2l0aW9uJzogc2VsZi5vcHRpb25zLnNwZWVkICsgJ21zJyxcclxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0Jy1vLXRyYW5zaXRpb24nOiBzZWxmLm9wdGlvbnMuc3BlZWQgKyAnbXMnLFxyXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQnLW1zLXRyYW5zaXRpb24nOiBzZWxmLm9wdGlvbnMuc3BlZWQgKyAnbXMnLFxyXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQndHJhbnNpdGlvbic6IHNlbGYub3B0aW9ucy5zcGVlZCArICdtcydcclxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdH0pO1xyXG5cdFx0XHRcdFx0XHRcdFx0XHRcdH1cclxuXHRcdFx0XHRcdFx0XHRcdFx0fSwgc2VsZi5vcHRpb25zLnNwZWVkKTtcclxuXHRcdFx0XHRcdFx0XHRcdH1cclxuXHRcdFx0XHRcdFx0XHR9LCBzZWxmLm9wdGlvbnMuc3BlZWQpO1xyXG5cdFx0XHRcdFx0XHR9XHJcblx0XHRcdFx0XHRcdGVsc2Uge1xyXG5cdFx0XHRcdFx0XHRcdHNlbGYuJHRvb2x0aXAuZmFkZVRvKHNlbGYub3B0aW9ucy5zcGVlZCwgMC41LCBmdW5jdGlvbigpIHtcclxuXHRcdFx0XHRcdFx0XHRcdGlmKHNlbGYuU3RhdHVzICE9ICdoaWRkZW4nKXtcclxuXHRcdFx0XHRcdFx0XHRcdFx0c2VsZi4kdG9vbHRpcC5mYWRlVG8oc2VsZi5vcHRpb25zLnNwZWVkLCAxKTtcclxuXHRcdFx0XHRcdFx0XHRcdH1cclxuXHRcdFx0XHRcdFx0XHR9KTtcclxuXHRcdFx0XHRcdFx0fVxyXG5cdFx0XHRcdFx0fVxyXG5cdFx0XHRcdH1cclxuXHRcdFx0fVxyXG5cdFx0XHRlbHNlIHtcclxuXHRcdFx0XHRzZWxmLmhpZGUoKTtcclxuXHRcdFx0fVxyXG5cdFx0fSxcclxuXHRcdFxyXG5cdFx0X3JlcG9zaXRpb25JbmZvOiBmdW5jdGlvbigkZWwpIHtcclxuXHRcdFx0cmV0dXJuIHtcclxuXHRcdFx0XHRkaW1lbnNpb246IHtcclxuXHRcdFx0XHRcdGhlaWdodDogJGVsLm91dGVySGVpZ2h0KGZhbHNlKSxcclxuXHRcdFx0XHRcdHdpZHRoOiAkZWwub3V0ZXJXaWR0aChmYWxzZSlcclxuXHRcdFx0XHR9LFxyXG5cdFx0XHRcdG9mZnNldDogJGVsLm9mZnNldCgpLFxyXG5cdFx0XHRcdHBvc2l0aW9uOiB7XHJcblx0XHRcdFx0XHRsZWZ0OiBwYXJzZUludCgkZWwuY3NzKCdsZWZ0JykpLFxyXG5cdFx0XHRcdFx0dG9wOiBwYXJzZUludCgkZWwuY3NzKCd0b3AnKSlcclxuXHRcdFx0XHR9XHJcblx0XHRcdH07XHJcblx0XHR9LFxyXG5cdFx0XHJcblx0XHRoaWRlOiBmdW5jdGlvbihjYWxsYmFjaykge1xyXG5cdFx0XHRcclxuXHRcdFx0dmFyIHNlbGYgPSB0aGlzO1xyXG5cdFx0XHRcclxuXHRcdFx0Ly8gc2F2ZSB0aGUgbWV0aG9kIGN1c3RvbSBjYWxsYmFjayBhbmQgY2FuY2VsIGFueSBzaG93IG1ldGhvZCBjdXN0b20gY2FsbGJhY2tzXHJcblx0XHRcdGlmIChjYWxsYmFjaykgc2VsZi5jYWxsYmFja3MuaGlkZS5wdXNoKGNhbGxiYWNrKTtcclxuXHRcdFx0c2VsZi5jYWxsYmFja3Muc2hvdyA9IFtdO1xyXG5cdFx0XHRcclxuXHRcdFx0Ly8gZ2V0IHJpZCBvZiBhbnkgYXBwZWFyYW5jZSB0aW1lb3V0XHJcblx0XHRcdGNsZWFyVGltZW91dChzZWxmLnRpbWVyU2hvdyk7XHJcblx0XHRcdHNlbGYudGltZXJTaG93ID0gbnVsbDtcclxuXHRcdFx0Y2xlYXJUaW1lb3V0KHNlbGYudGltZXJIaWRlKTtcclxuXHRcdFx0c2VsZi50aW1lckhpZGUgPSBudWxsO1xyXG5cdFx0XHRcclxuXHRcdFx0dmFyIGZpbmlzaENhbGxiYWNrcyA9IGZ1bmN0aW9uKCkge1xyXG5cdFx0XHRcdC8vIHRyaWdnZXIgYW55IGhpZGUgbWV0aG9kIGN1c3RvbSBjYWxsYmFja3MgYW5kIHJlc2V0IHRoZW1cclxuXHRcdFx0XHQkLmVhY2goc2VsZi5jYWxsYmFja3MuaGlkZSwgZnVuY3Rpb24oaSxjKSB7IGMuY2FsbChzZWxmLiRlbCk7IH0pO1xyXG5cdFx0XHRcdHNlbGYuY2FsbGJhY2tzLmhpZGUgPSBbXTtcclxuXHRcdFx0fTtcclxuXHRcdFx0XHJcblx0XHRcdC8vIGhpZGVcclxuXHRcdFx0aWYgKHNlbGYuU3RhdHVzID09ICdzaG93bicgfHwgc2VsZi5TdGF0dXMgPT0gJ2FwcGVhcmluZycpIHtcclxuXHRcdFx0XHRcclxuXHRcdFx0XHRzZWxmLlN0YXR1cyA9ICdkaXNhcHBlYXJpbmcnO1xyXG5cdFx0XHRcdFxyXG5cdFx0XHRcdHZhciBmaW5pc2ggPSBmdW5jdGlvbigpIHtcclxuXHRcdFx0XHRcdFxyXG5cdFx0XHRcdFx0c2VsZi5TdGF0dXMgPSAnaGlkZGVuJztcclxuXHRcdFx0XHRcdFxyXG5cdFx0XHRcdFx0Ly8gZGV0YWNoIG91ciBjb250ZW50IG9iamVjdCBmaXJzdCwgc28gdGhlIG5leHQgalF1ZXJ5J3MgcmVtb3ZlKCkgY2FsbCBkb2VzIG5vdCB1bmJpbmQgaXRzIGV2ZW50IGhhbmRsZXJzXHJcblx0XHRcdFx0XHRpZiAodHlwZW9mIHNlbGYuQ29udGVudCA9PSAnb2JqZWN0JyAmJiBzZWxmLkNvbnRlbnQgIT09IG51bGwpIHtcclxuXHRcdFx0XHRcdFx0c2VsZi5Db250ZW50LmRldGFjaCgpO1xyXG5cdFx0XHRcdFx0fVxyXG5cdFx0XHRcdFx0XHJcblx0XHRcdFx0XHRzZWxmLiR0b29sdGlwLnJlbW92ZSgpO1xyXG5cdFx0XHRcdFx0c2VsZi4kdG9vbHRpcCA9IG51bGw7XHJcblx0XHRcdFx0XHRcclxuXHRcdFx0XHRcdC8vIHVuYmluZCBvcmllbnRhdGlvbmNoYW5nZSwgc2Nyb2xsIGFuZCByZXNpemUgbGlzdGVuZXJzXHJcblx0XHRcdFx0XHQkKHdpbmRvdykub2ZmKCcuJysgc2VsZi5uYW1lc3BhY2UpO1xyXG5cdFx0XHRcdFx0XHJcblx0XHRcdFx0XHQkKCdib2R5JylcclxuXHRcdFx0XHRcdFx0Ly8gdW5iaW5kIGFueSBhdXRvLWNsb3NpbmcgY2xpY2svdG91Y2ggbGlzdGVuZXJzXHJcblx0XHRcdFx0XHRcdC5vZmYoJy4nKyBzZWxmLm5hbWVzcGFjZSlcclxuXHRcdFx0XHRcdFx0LmNzcygnb3ZlcmZsb3cteCcsIHNlbGYuYm9keU92ZXJmbG93WCk7XHJcblx0XHRcdFx0XHRcclxuXHRcdFx0XHRcdC8vIHVuYmluZCBhbnkgYXV0by1jbG9zaW5nIGNsaWNrL3RvdWNoIGxpc3RlbmVyc1xyXG5cdFx0XHRcdFx0JCgnYm9keScpLm9mZignLicrIHNlbGYubmFtZXNwYWNlKTtcclxuXHRcdFx0XHRcdFxyXG5cdFx0XHRcdFx0Ly8gdW5iaW5kIGFueSBhdXRvLWNsb3NpbmcgaG92ZXIgbGlzdGVuZXJzXHJcblx0XHRcdFx0XHRzZWxmLiRlbFByb3h5Lm9mZignLicrIHNlbGYubmFtZXNwYWNlICsgJy1hdXRvQ2xvc2UnKTtcclxuXHRcdFx0XHRcdFxyXG5cdFx0XHRcdFx0Ly8gY2FsbCBvdXIgY29uc3RydWN0b3IgY3VzdG9tIGNhbGxiYWNrIGZ1bmN0aW9uXHJcblx0XHRcdFx0XHRzZWxmLm9wdGlvbnMuZnVuY3Rpb25BZnRlci5jYWxsKHNlbGYuJGVsLCBzZWxmLiRlbCk7XHJcblx0XHRcdFx0XHRcclxuXHRcdFx0XHRcdC8vIGNhbGwgb3VyIG1ldGhvZCBjdXN0b20gY2FsbGJhY2tzIGZ1bmN0aW9uc1xyXG5cdFx0XHRcdFx0ZmluaXNoQ2FsbGJhY2tzKCk7XHJcblx0XHRcdFx0fTtcclxuXHRcdFx0XHRcclxuXHRcdFx0XHRpZiAoc3VwcG9ydHNUcmFuc2l0aW9ucygpKSB7XHJcblx0XHRcdFx0XHRcclxuXHRcdFx0XHRcdHNlbGYuJHRvb2x0aXBcclxuXHRcdFx0XHRcdFx0LmNsZWFyUXVldWUoKVxyXG5cdFx0XHRcdFx0XHQucmVtb3ZlQ2xhc3MoJ3Rvb2x0aXBzdGVyLScgKyBzZWxmLm9wdGlvbnMuYW5pbWF0aW9uICsgJy1zaG93JylcclxuXHRcdFx0XHRcdFx0Ly8gZm9yIHRyYW5zaXRpb25zIG9ubHlcclxuXHRcdFx0XHRcdFx0LmFkZENsYXNzKCd0b29sdGlwc3Rlci1keWluZycpO1xyXG5cdFx0XHRcdFx0XHJcblx0XHRcdFx0XHRpZihzZWxmLm9wdGlvbnMuc3BlZWQgPiAwKSBzZWxmLiR0b29sdGlwLmRlbGF5KHNlbGYub3B0aW9ucy5zcGVlZCk7XHJcblx0XHRcdFx0XHRcclxuXHRcdFx0XHRcdHNlbGYuJHRvb2x0aXAucXVldWUoZmluaXNoKTtcclxuXHRcdFx0XHR9XHJcblx0XHRcdFx0ZWxzZSB7XHJcblx0XHRcdFx0XHRzZWxmLiR0b29sdGlwXHJcblx0XHRcdFx0XHRcdC5zdG9wKClcclxuXHRcdFx0XHRcdFx0LmZhZGVPdXQoc2VsZi5vcHRpb25zLnNwZWVkLCBmaW5pc2gpO1xyXG5cdFx0XHRcdH1cclxuXHRcdFx0fVxyXG5cdFx0XHQvLyBpZiB0aGUgdG9vbHRpcCBpcyBhbHJlYWR5IGhpZGRlbiwgd2Ugc3RpbGwgbmVlZCB0byB0cmlnZ2VyIHRoZSBtZXRob2QgY3VzdG9tIGNhbGxiYWNrXHJcblx0XHRcdGVsc2UgaWYoc2VsZi5TdGF0dXMgPT0gJ2hpZGRlbicpIHtcclxuXHRcdFx0XHRmaW5pc2hDYWxsYmFja3MoKTtcclxuXHRcdFx0fVxyXG5cdFx0XHRcclxuXHRcdFx0cmV0dXJuIHNlbGY7XHJcblx0XHR9LFxyXG5cdFx0XHJcblx0XHQvLyB0aGUgcHVibGljIHNob3coKSBtZXRob2QgaXMgYWN0dWFsbHkgYW4gYWxpYXMgZm9yIHRoZSBwcml2YXRlIHNob3dOb3coKSBtZXRob2RcclxuXHRcdHNob3c6IGZ1bmN0aW9uKGNhbGxiYWNrKSB7XHJcblx0XHRcdHRoaXMuX3Nob3dOb3coY2FsbGJhY2spO1xyXG5cdFx0XHRyZXR1cm4gdGhpcztcclxuXHRcdH0sXHJcblx0XHRcclxuXHRcdC8vICd1cGRhdGUnIGlzIGRlcHJlY2F0ZWQgaW4gZmF2b3Igb2YgJ2NvbnRlbnQnIGJ1dCBpcyBrZXB0IGZvciBiYWNrd2FyZCBjb21wYXRpYmlsaXR5XHJcblx0XHR1cGRhdGU6IGZ1bmN0aW9uKGMpIHtcclxuXHRcdFx0cmV0dXJuIHRoaXMuY29udGVudChjKTtcclxuXHRcdH0sXHJcblx0XHRjb250ZW50OiBmdW5jdGlvbihjKSB7XHJcblx0XHRcdC8vIGdldHRlciBtZXRob2RcclxuXHRcdFx0aWYodHlwZW9mIGMgPT09ICd1bmRlZmluZWQnKXtcclxuXHRcdFx0XHRyZXR1cm4gdGhpcy5Db250ZW50O1xyXG5cdFx0XHR9XHJcblx0XHRcdC8vIHNldHRlciBtZXRob2RcclxuXHRcdFx0ZWxzZSB7XHJcblx0XHRcdFx0dGhpcy5fdXBkYXRlKGMpO1xyXG5cdFx0XHRcdHJldHVybiB0aGlzO1xyXG5cdFx0XHR9XHJcblx0XHR9LFxyXG5cdFx0XHJcblx0XHRyZXBvc2l0aW9uOiBmdW5jdGlvbigpIHtcclxuXHRcdFx0XHJcblx0XHRcdHZhciBzZWxmID0gdGhpcztcclxuXHRcdFx0XHJcblx0XHRcdC8vIGluIGNhc2UgdGhlIHRvb2x0aXAgaGFzIGJlZW4gcmVtb3ZlZCBmcm9tIERPTSBtYW51YWxseVxyXG5cdFx0XHRpZiAoJCgnYm9keScpLmZpbmQoc2VsZi4kdG9vbHRpcCkubGVuZ3RoICE9PSAwKSB7XHJcblx0XHRcdFx0XHJcblx0XHRcdFx0Ly8gcmVzZXQgd2lkdGhcclxuXHRcdFx0XHRzZWxmLiR0b29sdGlwLmNzcygnd2lkdGgnLCAnJyk7XHJcblx0XHRcdFx0XHJcblx0XHRcdFx0Ly8gZmluZCB2YXJpYWJsZXMgdG8gZGV0ZXJtaW5lIHBsYWNlbWVudFxyXG5cdFx0XHRcdHNlbGYuZWxQcm94eVBvc2l0aW9uID0gc2VsZi5fcmVwb3NpdGlvbkluZm8oc2VsZi4kZWxQcm94eSk7XHJcblx0XHRcdFx0dmFyIGFycm93UmVwb3NpdGlvbiA9IG51bGwsXHJcblx0XHRcdFx0XHR3aW5kb3dXaWR0aCA9ICQod2luZG93KS53aWR0aCgpLFxyXG5cdFx0XHRcdFx0Ly8gc2hvcnRoYW5kXHJcblx0XHRcdFx0XHRwcm94eSA9IHNlbGYuZWxQcm94eVBvc2l0aW9uLFxyXG5cdFx0XHRcdFx0dG9vbHRpcFdpZHRoID0gc2VsZi4kdG9vbHRpcC5vdXRlcldpZHRoKGZhbHNlKSxcclxuXHRcdFx0XHRcdHRvb2x0aXBJbm5lcldpZHRoID0gc2VsZi4kdG9vbHRpcC5pbm5lcldpZHRoKCkgKyAxLCAvLyB0aGlzICsxIHN0b3BzIEZpcmVGb3ggZnJvbSBzb21ldGltZXMgZm9yY2luZyBhbiBhZGRpdGlvbmFsIHRleHQgbGluZVxyXG5cdFx0XHRcdFx0dG9vbHRpcEhlaWdodCA9IHNlbGYuJHRvb2x0aXAub3V0ZXJIZWlnaHQoZmFsc2UpO1xyXG5cdFx0XHRcdFxyXG5cdFx0XHRcdC8vIGlmIHRoaXMgaXMgYW4gPGFyZWE+IHRhZyBpbnNpZGUgYSA8bWFwPiwgYWxsIGhlbGwgYnJlYWtzIGxvb3NlLiBSZWNhbGN1bGF0ZSBhbGwgdGhlIG1lYXN1cmVtZW50cyBiYXNlZCBvbiBjb29yZGluYXRlc1xyXG5cdFx0XHRcdGlmIChzZWxmLiRlbFByb3h5LmlzKCdhcmVhJykpIHtcclxuXHRcdFx0XHRcdHZhciBhcmVhU2hhcGUgPSBzZWxmLiRlbFByb3h5LmF0dHIoJ3NoYXBlJyksXHJcblx0XHRcdFx0XHRcdG1hcE5hbWUgPSBzZWxmLiRlbFByb3h5LnBhcmVudCgpLmF0dHIoJ25hbWUnKSxcclxuXHRcdFx0XHRcdFx0bWFwID0gJCgnaW1nW3VzZW1hcD1cIiMnKyBtYXBOYW1lICsnXCJdJyksXHJcblx0XHRcdFx0XHRcdG1hcE9mZnNldExlZnQgPSBtYXAub2Zmc2V0KCkubGVmdCxcclxuXHRcdFx0XHRcdFx0bWFwT2Zmc2V0VG9wID0gbWFwLm9mZnNldCgpLnRvcCxcclxuXHRcdFx0XHRcdFx0YXJlYU1lYXN1cmVtZW50cyA9IHNlbGYuJGVsUHJveHkuYXR0cignY29vcmRzJykgIT09IHVuZGVmaW5lZCA/IHNlbGYuJGVsUHJveHkuYXR0cignY29vcmRzJykuc3BsaXQoJywnKSA6IHVuZGVmaW5lZDtcclxuXHRcdFx0XHRcdFxyXG5cdFx0XHRcdFx0aWYgKGFyZWFTaGFwZSA9PSAnY2lyY2xlJykge1xyXG5cdFx0XHRcdFx0XHR2YXIgYXJlYUxlZnQgPSBwYXJzZUludChhcmVhTWVhc3VyZW1lbnRzWzBdKSxcclxuXHRcdFx0XHRcdFx0XHRhcmVhVG9wID0gcGFyc2VJbnQoYXJlYU1lYXN1cmVtZW50c1sxXSksXHJcblx0XHRcdFx0XHRcdFx0YXJlYVdpZHRoID0gcGFyc2VJbnQoYXJlYU1lYXN1cmVtZW50c1syXSk7XHJcblx0XHRcdFx0XHRcdHByb3h5LmRpbWVuc2lvbi5oZWlnaHQgPSBhcmVhV2lkdGggKiAyO1xyXG5cdFx0XHRcdFx0XHRwcm94eS5kaW1lbnNpb24ud2lkdGggPSBhcmVhV2lkdGggKiAyO1xyXG5cdFx0XHRcdFx0XHRwcm94eS5vZmZzZXQudG9wID0gbWFwT2Zmc2V0VG9wICsgYXJlYVRvcCAtIGFyZWFXaWR0aDtcclxuXHRcdFx0XHRcdFx0cHJveHkub2Zmc2V0LmxlZnQgPSBtYXBPZmZzZXRMZWZ0ICsgYXJlYUxlZnQgLSBhcmVhV2lkdGg7XHJcblx0XHRcdFx0XHR9XHJcblx0XHRcdFx0XHRlbHNlIGlmIChhcmVhU2hhcGUgPT0gJ3JlY3QnKSB7XHJcblx0XHRcdFx0XHRcdHZhciBhcmVhTGVmdCA9IHBhcnNlSW50KGFyZWFNZWFzdXJlbWVudHNbMF0pLFxyXG5cdFx0XHRcdFx0XHRcdGFyZWFUb3AgPSBwYXJzZUludChhcmVhTWVhc3VyZW1lbnRzWzFdKSxcclxuXHRcdFx0XHRcdFx0XHRhcmVhUmlnaHQgPSBwYXJzZUludChhcmVhTWVhc3VyZW1lbnRzWzJdKSxcclxuXHRcdFx0XHRcdFx0XHRhcmVhQm90dG9tID0gcGFyc2VJbnQoYXJlYU1lYXN1cmVtZW50c1szXSk7XHJcblx0XHRcdFx0XHRcdHByb3h5LmRpbWVuc2lvbi5oZWlnaHQgPSBhcmVhQm90dG9tIC0gYXJlYVRvcDtcclxuXHRcdFx0XHRcdFx0cHJveHkuZGltZW5zaW9uLndpZHRoID0gYXJlYVJpZ2h0IC0gYXJlYUxlZnQ7XHJcblx0XHRcdFx0XHRcdHByb3h5Lm9mZnNldC50b3AgPSBtYXBPZmZzZXRUb3AgKyBhcmVhVG9wO1xyXG5cdFx0XHRcdFx0XHRwcm94eS5vZmZzZXQubGVmdCA9IG1hcE9mZnNldExlZnQgKyBhcmVhTGVmdDtcclxuXHRcdFx0XHRcdH1cclxuXHRcdFx0XHRcdGVsc2UgaWYgKGFyZWFTaGFwZSA9PSAncG9seScpIHtcclxuXHRcdFx0XHRcdFx0dmFyIGFyZWFYcyA9IFtdLFxyXG5cdFx0XHRcdFx0XHRcdGFyZWFZcyA9IFtdLFxyXG5cdFx0XHRcdFx0XHRcdGFyZWFTbWFsbGVzdFggPSAwLFxyXG5cdFx0XHRcdFx0XHRcdGFyZWFTbWFsbGVzdFkgPSAwLFxyXG5cdFx0XHRcdFx0XHRcdGFyZWFHcmVhdGVzdFggPSAwLFxyXG5cdFx0XHRcdFx0XHRcdGFyZWFHcmVhdGVzdFkgPSAwLFxyXG5cdFx0XHRcdFx0XHRcdGFycmF5QWx0ZXJuYXRlID0gJ2V2ZW4nO1xyXG5cdFx0XHRcdFx0XHRcclxuXHRcdFx0XHRcdFx0Zm9yICh2YXIgaSA9IDA7IGkgPCBhcmVhTWVhc3VyZW1lbnRzLmxlbmd0aDsgaSsrKSB7XHJcblx0XHRcdFx0XHRcdFx0dmFyIGFyZWFOdW1iZXIgPSBwYXJzZUludChhcmVhTWVhc3VyZW1lbnRzW2ldKTtcclxuXHRcdFx0XHRcdFx0XHRcclxuXHRcdFx0XHRcdFx0XHRpZiAoYXJyYXlBbHRlcm5hdGUgPT0gJ2V2ZW4nKSB7XHJcblx0XHRcdFx0XHRcdFx0XHRpZiAoYXJlYU51bWJlciA+IGFyZWFHcmVhdGVzdFgpIHtcclxuXHRcdFx0XHRcdFx0XHRcdFx0YXJlYUdyZWF0ZXN0WCA9IGFyZWFOdW1iZXI7XHJcblx0XHRcdFx0XHRcdFx0XHRcdGlmIChpID09PSAwKSB7XHJcblx0XHRcdFx0XHRcdFx0XHRcdFx0YXJlYVNtYWxsZXN0WCA9IGFyZWFHcmVhdGVzdFg7XHJcblx0XHRcdFx0XHRcdFx0XHRcdH1cclxuXHRcdFx0XHRcdFx0XHRcdH1cclxuXHRcdFx0XHRcdFx0XHRcdFxyXG5cdFx0XHRcdFx0XHRcdFx0aWYgKGFyZWFOdW1iZXIgPCBhcmVhU21hbGxlc3RYKSB7XHJcblx0XHRcdFx0XHRcdFx0XHRcdGFyZWFTbWFsbGVzdFggPSBhcmVhTnVtYmVyO1xyXG5cdFx0XHRcdFx0XHRcdFx0fVxyXG5cdFx0XHRcdFx0XHRcdFx0XHJcblx0XHRcdFx0XHRcdFx0XHRhcnJheUFsdGVybmF0ZSA9ICdvZGQnO1xyXG5cdFx0XHRcdFx0XHRcdH1cclxuXHRcdFx0XHRcdFx0XHRlbHNlIHtcclxuXHRcdFx0XHRcdFx0XHRcdGlmIChhcmVhTnVtYmVyID4gYXJlYUdyZWF0ZXN0WSkge1xyXG5cdFx0XHRcdFx0XHRcdFx0XHRhcmVhR3JlYXRlc3RZID0gYXJlYU51bWJlcjtcclxuXHRcdFx0XHRcdFx0XHRcdFx0aWYgKGkgPT0gMSkge1xyXG5cdFx0XHRcdFx0XHRcdFx0XHRcdGFyZWFTbWFsbGVzdFkgPSBhcmVhR3JlYXRlc3RZO1xyXG5cdFx0XHRcdFx0XHRcdFx0XHR9XHJcblx0XHRcdFx0XHRcdFx0XHR9XHJcblx0XHRcdFx0XHRcdFx0XHRcclxuXHRcdFx0XHRcdFx0XHRcdGlmIChhcmVhTnVtYmVyIDwgYXJlYVNtYWxsZXN0WSkge1xyXG5cdFx0XHRcdFx0XHRcdFx0XHRhcmVhU21hbGxlc3RZID0gYXJlYU51bWJlcjtcclxuXHRcdFx0XHRcdFx0XHRcdH1cclxuXHRcdFx0XHRcdFx0XHRcdFxyXG5cdFx0XHRcdFx0XHRcdFx0YXJyYXlBbHRlcm5hdGUgPSAnZXZlbic7XHJcblx0XHRcdFx0XHRcdFx0fVxyXG5cdFx0XHRcdFx0XHR9XHJcblx0XHRcdFx0XHRcclxuXHRcdFx0XHRcdFx0cHJveHkuZGltZW5zaW9uLmhlaWdodCA9IGFyZWFHcmVhdGVzdFkgLSBhcmVhU21hbGxlc3RZO1xyXG5cdFx0XHRcdFx0XHRwcm94eS5kaW1lbnNpb24ud2lkdGggPSBhcmVhR3JlYXRlc3RYIC0gYXJlYVNtYWxsZXN0WDtcclxuXHRcdFx0XHRcdFx0cHJveHkub2Zmc2V0LnRvcCA9IG1hcE9mZnNldFRvcCArIGFyZWFTbWFsbGVzdFk7XHJcblx0XHRcdFx0XHRcdHByb3h5Lm9mZnNldC5sZWZ0ID0gbWFwT2Zmc2V0TGVmdCArIGFyZWFTbWFsbGVzdFg7XHJcblx0XHRcdFx0XHR9XHJcblx0XHRcdFx0XHRlbHNlIHtcclxuXHRcdFx0XHRcdFx0cHJveHkuZGltZW5zaW9uLmhlaWdodCA9IG1hcC5vdXRlckhlaWdodChmYWxzZSk7XHJcblx0XHRcdFx0XHRcdHByb3h5LmRpbWVuc2lvbi53aWR0aCA9IG1hcC5vdXRlcldpZHRoKGZhbHNlKTtcclxuXHRcdFx0XHRcdFx0cHJveHkub2Zmc2V0LnRvcCA9IG1hcE9mZnNldFRvcDtcclxuXHRcdFx0XHRcdFx0cHJveHkub2Zmc2V0LmxlZnQgPSBtYXBPZmZzZXRMZWZ0O1xyXG5cdFx0XHRcdFx0fVxyXG5cdFx0XHRcdH1cclxuXHRcdFx0XHRcclxuXHRcdFx0XHQvLyBvdXIgZnVuY3Rpb24gYW5kIGdsb2JhbCB2YXJzIGZvciBwb3NpdGlvbmluZyBvdXIgdG9vbHRpcFxyXG5cdFx0XHRcdHZhciBteUxlZnQgPSAwLFxyXG5cdFx0XHRcdFx0bXlMZWZ0TWlycm9yID0gMCxcclxuXHRcdFx0XHRcdG15VG9wID0gMCxcclxuXHRcdFx0XHRcdG9mZnNldFkgPSBwYXJzZUludChzZWxmLm9wdGlvbnMub2Zmc2V0WSksXHJcblx0XHRcdFx0XHRvZmZzZXRYID0gcGFyc2VJbnQoc2VsZi5vcHRpb25zLm9mZnNldFgpLFxyXG5cdFx0XHRcdFx0Ly8gdGhpcyBpcyB0aGUgYXJyb3cgcG9zaXRpb24gdGhhdCB3aWxsIGV2ZW50dWFsbHkgYmUgdXNlZC4gSXQgbWF5IGRpZmZlciBmcm9tIHRoZSBwb3NpdGlvbiBvcHRpb24gaWYgdGhlIHRvb2x0aXAgY2Fubm90IGJlIGRpc3BsYXllZCBpbiB0aGlzIHBvc2l0aW9uXHJcblx0XHRcdFx0XHRwcmFjdGljYWxQb3NpdGlvbiA9IHNlbGYub3B0aW9ucy5wb3NpdGlvbjtcclxuXHRcdFx0XHRcclxuXHRcdFx0XHQvLyBhIGZ1bmN0aW9uIHRvIGRldGVjdCBpZiB0aGUgdG9vbHRpcCBpcyBnb2luZyBvZmYgdGhlIHNjcmVlbiBob3Jpem9udGFsbHkuIElmIHNvLCByZXBvc2l0aW9uIHRoZSBjcmFwIG91dCBvZiBpdCFcclxuXHRcdFx0XHRmdW5jdGlvbiBkb250R29PZmZTY3JlZW5YKCkge1xyXG5cdFx0XHRcdFxyXG5cdFx0XHRcdFx0dmFyIHdpbmRvd0xlZnQgPSAkKHdpbmRvdykuc2Nyb2xsTGVmdCgpO1xyXG5cdFx0XHRcdFx0XHJcblx0XHRcdFx0XHQvLyBpZiB0aGUgdG9vbHRpcCBnb2VzIG9mZiB0aGUgbGVmdCBzaWRlIG9mIHRoZSBzY3JlZW4sIGxpbmUgaXQgdXAgd2l0aCB0aGUgbGVmdCBzaWRlIG9mIHRoZSB3aW5kb3dcclxuXHRcdFx0XHRcdGlmKChteUxlZnQgLSB3aW5kb3dMZWZ0KSA8IDApIHtcclxuXHRcdFx0XHRcdFx0YXJyb3dSZXBvc2l0aW9uID0gbXlMZWZ0IC0gd2luZG93TGVmdDtcclxuXHRcdFx0XHRcdFx0bXlMZWZ0ID0gd2luZG93TGVmdDtcclxuXHRcdFx0XHRcdH1cclxuXHRcdFx0XHRcdFxyXG5cdFx0XHRcdFx0Ly8gaWYgdGhlIHRvb2x0aXAgZ29lcyBvZmYgdGhlIHJpZ2h0IG9mIHRoZSBzY3JlZW4sIGxpbmUgaXQgdXAgd2l0aCB0aGUgcmlnaHQgc2lkZSBvZiB0aGUgd2luZG93XHJcblx0XHRcdFx0XHRpZiAoKChteUxlZnQgKyB0b29sdGlwV2lkdGgpIC0gd2luZG93TGVmdCkgPiB3aW5kb3dXaWR0aCkge1xyXG5cdFx0XHRcdFx0XHRhcnJvd1JlcG9zaXRpb24gPSBteUxlZnQgLSAoKHdpbmRvd1dpZHRoICsgd2luZG93TGVmdCkgLSB0b29sdGlwV2lkdGgpO1xyXG5cdFx0XHRcdFx0XHRteUxlZnQgPSAod2luZG93V2lkdGggKyB3aW5kb3dMZWZ0KSAtIHRvb2x0aXBXaWR0aDtcclxuXHRcdFx0XHRcdH1cclxuXHRcdFx0XHR9XHJcblx0XHRcdFx0XHJcblx0XHRcdFx0Ly8gYSBmdW5jdGlvbiB0byBkZXRlY3QgaWYgdGhlIHRvb2x0aXAgaXMgZ29pbmcgb2ZmIHRoZSBzY3JlZW4gdmVydGljYWxseS4gSWYgc28sIHN3aXRjaCB0byB0aGUgb3Bwb3NpdGUhXHJcblx0XHRcdFx0ZnVuY3Rpb24gZG9udEdvT2ZmU2NyZWVuWShzd2l0Y2hUbywgc3dpdGNoRnJvbSkge1xyXG5cdFx0XHRcdFx0Ly8gaWYgaXQgZ29lcyBvZmYgdGhlIHRvcCBvZmYgdGhlIHBhZ2VcclxuXHRcdFx0XHRcdGlmKCgocHJveHkub2Zmc2V0LnRvcCAtICQod2luZG93KS5zY3JvbGxUb3AoKSAtIHRvb2x0aXBIZWlnaHQgLSBvZmZzZXRZIC0gMTIpIDwgMCkgJiYgKHN3aXRjaEZyb20uaW5kZXhPZigndG9wJykgPiAtMSkpIHtcclxuXHRcdFx0XHRcdFx0cHJhY3RpY2FsUG9zaXRpb24gPSBzd2l0Y2hUbztcclxuXHRcdFx0XHRcdH1cclxuXHRcdFx0XHRcdFxyXG5cdFx0XHRcdFx0Ly8gaWYgaXQgZ29lcyBvZmYgdGhlIGJvdHRvbSBvZiB0aGUgcGFnZVxyXG5cdFx0XHRcdFx0aWYgKCgocHJveHkub2Zmc2V0LnRvcCArIHByb3h5LmRpbWVuc2lvbi5oZWlnaHQgKyB0b29sdGlwSGVpZ2h0ICsgMTIgKyBvZmZzZXRZKSA+ICgkKHdpbmRvdykuc2Nyb2xsVG9wKCkgKyAkKHdpbmRvdykuaGVpZ2h0KCkpKSAmJiAoc3dpdGNoRnJvbS5pbmRleE9mKCdib3R0b20nKSA+IC0xKSkge1xyXG5cdFx0XHRcdFx0XHRwcmFjdGljYWxQb3NpdGlvbiA9IHN3aXRjaFRvO1xyXG5cdFx0XHRcdFx0XHRteVRvcCA9IChwcm94eS5vZmZzZXQudG9wIC0gdG9vbHRpcEhlaWdodCkgLSBvZmZzZXRZIC0gMTI7XHJcblx0XHRcdFx0XHR9XHJcblx0XHRcdFx0fVxyXG5cdFx0XHRcdFxyXG5cdFx0XHRcdGlmKHByYWN0aWNhbFBvc2l0aW9uID09ICd0b3AnKSB7XHJcblx0XHRcdFx0XHR2YXIgbGVmdERpZmZlcmVuY2UgPSAocHJveHkub2Zmc2V0LmxlZnQgKyB0b29sdGlwV2lkdGgpIC0gKHByb3h5Lm9mZnNldC5sZWZ0ICsgcHJveHkuZGltZW5zaW9uLndpZHRoKTtcclxuXHRcdFx0XHRcdG15TGVmdCA9IChwcm94eS5vZmZzZXQubGVmdCArIG9mZnNldFgpIC0gKGxlZnREaWZmZXJlbmNlIC8gMik7XHJcblx0XHRcdFx0XHRteVRvcCA9IChwcm94eS5vZmZzZXQudG9wIC0gdG9vbHRpcEhlaWdodCkgLSBvZmZzZXRZIC0gMTI7XHJcblx0XHRcdFx0XHRkb250R29PZmZTY3JlZW5YKCk7XHJcblx0XHRcdFx0XHRkb250R29PZmZTY3JlZW5ZKCdib3R0b20nLCAndG9wJyk7XHJcblx0XHRcdFx0fVxyXG5cdFx0XHRcdFxyXG5cdFx0XHRcdGlmKHByYWN0aWNhbFBvc2l0aW9uID09ICd0b3AtbGVmdCcpIHtcclxuXHRcdFx0XHRcdG15TGVmdCA9IHByb3h5Lm9mZnNldC5sZWZ0ICsgb2Zmc2V0WDtcclxuXHRcdFx0XHRcdG15VG9wID0gKHByb3h5Lm9mZnNldC50b3AgLSB0b29sdGlwSGVpZ2h0KSAtIG9mZnNldFkgLSAxMjtcclxuXHRcdFx0XHRcdGRvbnRHb09mZlNjcmVlblgoKTtcclxuXHRcdFx0XHRcdGRvbnRHb09mZlNjcmVlblkoJ2JvdHRvbS1sZWZ0JywgJ3RvcC1sZWZ0Jyk7XHJcblx0XHRcdFx0fVxyXG5cdFx0XHRcdFxyXG5cdFx0XHRcdGlmKHByYWN0aWNhbFBvc2l0aW9uID09ICd0b3AtcmlnaHQnKSB7XHJcblx0XHRcdFx0XHRteUxlZnQgPSAocHJveHkub2Zmc2V0LmxlZnQgKyBwcm94eS5kaW1lbnNpb24ud2lkdGggKyBvZmZzZXRYKSAtIHRvb2x0aXBXaWR0aDtcclxuXHRcdFx0XHRcdG15VG9wID0gKHByb3h5Lm9mZnNldC50b3AgLSB0b29sdGlwSGVpZ2h0KSAtIG9mZnNldFkgLSAxMjtcclxuXHRcdFx0XHRcdGRvbnRHb09mZlNjcmVlblgoKTtcclxuXHRcdFx0XHRcdGRvbnRHb09mZlNjcmVlblkoJ2JvdHRvbS1yaWdodCcsICd0b3AtcmlnaHQnKTtcclxuXHRcdFx0XHR9XHJcblx0XHRcdFx0XHJcblx0XHRcdFx0aWYocHJhY3RpY2FsUG9zaXRpb24gPT0gJ2JvdHRvbScpIHtcclxuXHRcdFx0XHRcdHZhciBsZWZ0RGlmZmVyZW5jZSA9IChwcm94eS5vZmZzZXQubGVmdCArIHRvb2x0aXBXaWR0aCkgLSAocHJveHkub2Zmc2V0LmxlZnQgKyBwcm94eS5kaW1lbnNpb24ud2lkdGgpO1xyXG5cdFx0XHRcdFx0bXlMZWZ0ID0gcHJveHkub2Zmc2V0LmxlZnQgLSAobGVmdERpZmZlcmVuY2UgLyAyKSArIG9mZnNldFg7XHJcblx0XHRcdFx0XHRteVRvcCA9IChwcm94eS5vZmZzZXQudG9wICsgcHJveHkuZGltZW5zaW9uLmhlaWdodCkgKyBvZmZzZXRZICsgMTI7XHJcblx0XHRcdFx0XHRkb250R29PZmZTY3JlZW5YKCk7XHJcblx0XHRcdFx0XHRkb250R29PZmZTY3JlZW5ZKCd0b3AnLCAnYm90dG9tJyk7XHJcblx0XHRcdFx0fVxyXG5cdFx0XHRcdFxyXG5cdFx0XHRcdGlmKHByYWN0aWNhbFBvc2l0aW9uID09ICdib3R0b20tbGVmdCcpIHtcclxuXHRcdFx0XHRcdG15TGVmdCA9IHByb3h5Lm9mZnNldC5sZWZ0ICsgb2Zmc2V0WDtcclxuXHRcdFx0XHRcdG15VG9wID0gKHByb3h5Lm9mZnNldC50b3AgKyBwcm94eS5kaW1lbnNpb24uaGVpZ2h0KSArIG9mZnNldFkgKyAxMjtcclxuXHRcdFx0XHRcdGRvbnRHb09mZlNjcmVlblgoKTtcclxuXHRcdFx0XHRcdGRvbnRHb09mZlNjcmVlblkoJ3RvcC1sZWZ0JywgJ2JvdHRvbS1sZWZ0Jyk7XHJcblx0XHRcdFx0fVxyXG5cdFx0XHRcdFxyXG5cdFx0XHRcdGlmKHByYWN0aWNhbFBvc2l0aW9uID09ICdib3R0b20tcmlnaHQnKSB7XHJcblx0XHRcdFx0XHRteUxlZnQgPSAocHJveHkub2Zmc2V0LmxlZnQgKyBwcm94eS5kaW1lbnNpb24ud2lkdGggKyBvZmZzZXRYKSAtIHRvb2x0aXBXaWR0aDtcclxuXHRcdFx0XHRcdG15VG9wID0gKHByb3h5Lm9mZnNldC50b3AgKyBwcm94eS5kaW1lbnNpb24uaGVpZ2h0KSArIG9mZnNldFkgKyAxMjtcclxuXHRcdFx0XHRcdGRvbnRHb09mZlNjcmVlblgoKTtcclxuXHRcdFx0XHRcdGRvbnRHb09mZlNjcmVlblkoJ3RvcC1yaWdodCcsICdib3R0b20tcmlnaHQnKTtcclxuXHRcdFx0XHR9XHJcblx0XHRcdFx0XHJcblx0XHRcdFx0aWYocHJhY3RpY2FsUG9zaXRpb24gPT0gJ2xlZnQnKSB7XHJcblx0XHRcdFx0XHRteUxlZnQgPSBwcm94eS5vZmZzZXQubGVmdCAtIG9mZnNldFggLSB0b29sdGlwV2lkdGggLSAxMjtcclxuXHRcdFx0XHRcdG15TGVmdE1pcnJvciA9IHByb3h5Lm9mZnNldC5sZWZ0ICsgb2Zmc2V0WCArIHByb3h5LmRpbWVuc2lvbi53aWR0aCArIDEyO1xyXG5cdFx0XHRcdFx0dmFyIHRvcERpZmZlcmVuY2UgPSAocHJveHkub2Zmc2V0LnRvcCArIHRvb2x0aXBIZWlnaHQpIC0gKHByb3h5Lm9mZnNldC50b3AgKyBwcm94eS5kaW1lbnNpb24uaGVpZ2h0KTtcclxuXHRcdFx0XHRcdG15VG9wID0gcHJveHkub2Zmc2V0LnRvcCAtICh0b3BEaWZmZXJlbmNlIC8gMikgLSBvZmZzZXRZO1xyXG5cdFx0XHRcdFx0XHJcblx0XHRcdFx0XHQvLyBpZiB0aGUgdG9vbHRpcCBnb2VzIG9mZiBib3RocyBzaWRlcyBvZiB0aGUgcGFnZVxyXG5cdFx0XHRcdFx0aWYoKG15TGVmdCA8IDApICYmICgobXlMZWZ0TWlycm9yICsgdG9vbHRpcFdpZHRoKSA+IHdpbmRvd1dpZHRoKSkge1xyXG5cdFx0XHRcdFx0XHR2YXIgYm9yZGVyV2lkdGggPSBwYXJzZUZsb2F0KHNlbGYuJHRvb2x0aXAuY3NzKCdib3JkZXItd2lkdGgnKSkgKiAyLFxyXG5cdFx0XHRcdFx0XHRcdG5ld1dpZHRoID0gKHRvb2x0aXBXaWR0aCArIG15TGVmdCkgLSBib3JkZXJXaWR0aDtcclxuXHRcdFx0XHRcdFx0c2VsZi4kdG9vbHRpcC5jc3MoJ3dpZHRoJywgbmV3V2lkdGggKyAncHgnKTtcclxuXHRcdFx0XHRcdFx0XHJcblx0XHRcdFx0XHRcdHRvb2x0aXBIZWlnaHQgPSBzZWxmLiR0b29sdGlwLm91dGVySGVpZ2h0KGZhbHNlKTtcclxuXHRcdFx0XHRcdFx0bXlMZWZ0ID0gcHJveHkub2Zmc2V0LmxlZnQgLSBvZmZzZXRYIC0gbmV3V2lkdGggLSAxMiAtIGJvcmRlcldpZHRoO1xyXG5cdFx0XHRcdFx0XHR0b3BEaWZmZXJlbmNlID0gKHByb3h5Lm9mZnNldC50b3AgKyB0b29sdGlwSGVpZ2h0KSAtIChwcm94eS5vZmZzZXQudG9wICsgcHJveHkuZGltZW5zaW9uLmhlaWdodCk7XHJcblx0XHRcdFx0XHRcdG15VG9wID0gcHJveHkub2Zmc2V0LnRvcCAtICh0b3BEaWZmZXJlbmNlIC8gMikgLSBvZmZzZXRZO1xyXG5cdFx0XHRcdFx0fVxyXG5cdFx0XHRcdFx0XHJcblx0XHRcdFx0XHQvLyBpZiBpdCBvbmx5IGdvZXMgb2ZmIG9uZSBzaWRlLCBmbGlwIGl0IHRvIHRoZSBvdGhlciBzaWRlXHJcblx0XHRcdFx0XHRlbHNlIGlmKG15TGVmdCA8IDApIHtcclxuXHRcdFx0XHRcdFx0bXlMZWZ0ID0gcHJveHkub2Zmc2V0LmxlZnQgKyBvZmZzZXRYICsgcHJveHkuZGltZW5zaW9uLndpZHRoICsgMTI7XHJcblx0XHRcdFx0XHRcdGFycm93UmVwb3NpdGlvbiA9ICdsZWZ0JztcclxuXHRcdFx0XHRcdH1cclxuXHRcdFx0XHR9XHJcblx0XHRcdFx0XHJcblx0XHRcdFx0aWYocHJhY3RpY2FsUG9zaXRpb24gPT0gJ3JpZ2h0Jykge1xyXG5cdFx0XHRcdFx0bXlMZWZ0ID0gcHJveHkub2Zmc2V0LmxlZnQgKyBvZmZzZXRYICsgcHJveHkuZGltZW5zaW9uLndpZHRoICsgMTI7XHJcblx0XHRcdFx0XHRteUxlZnRNaXJyb3IgPSBwcm94eS5vZmZzZXQubGVmdCAtIG9mZnNldFggLSB0b29sdGlwV2lkdGggLSAxMjtcclxuXHRcdFx0XHRcdHZhciB0b3BEaWZmZXJlbmNlID0gKHByb3h5Lm9mZnNldC50b3AgKyB0b29sdGlwSGVpZ2h0KSAtIChwcm94eS5vZmZzZXQudG9wICsgcHJveHkuZGltZW5zaW9uLmhlaWdodCk7XHJcblx0XHRcdFx0XHRteVRvcCA9IHByb3h5Lm9mZnNldC50b3AgLSAodG9wRGlmZmVyZW5jZSAvIDIpIC0gb2Zmc2V0WTtcclxuXHRcdFx0XHRcdFxyXG5cdFx0XHRcdFx0Ly8gaWYgdGhlIHRvb2x0aXAgZ29lcyBvZmYgYm90aHMgc2lkZXMgb2YgdGhlIHBhZ2VcclxuXHRcdFx0XHRcdGlmKCgobXlMZWZ0ICsgdG9vbHRpcFdpZHRoKSA+IHdpbmRvd1dpZHRoKSAmJiAobXlMZWZ0TWlycm9yIDwgMCkpIHtcclxuXHRcdFx0XHRcdFx0dmFyIGJvcmRlcldpZHRoID0gcGFyc2VGbG9hdChzZWxmLiR0b29sdGlwLmNzcygnYm9yZGVyLXdpZHRoJykpICogMixcclxuXHRcdFx0XHRcdFx0XHRuZXdXaWR0aCA9ICh3aW5kb3dXaWR0aCAtIG15TGVmdCkgLSBib3JkZXJXaWR0aDtcclxuXHRcdFx0XHRcdFx0c2VsZi4kdG9vbHRpcC5jc3MoJ3dpZHRoJywgbmV3V2lkdGggKyAncHgnKTtcclxuXHRcdFx0XHRcdFx0XHJcblx0XHRcdFx0XHRcdHRvb2x0aXBIZWlnaHQgPSBzZWxmLiR0b29sdGlwLm91dGVySGVpZ2h0KGZhbHNlKTtcclxuXHRcdFx0XHRcdFx0dG9wRGlmZmVyZW5jZSA9IChwcm94eS5vZmZzZXQudG9wICsgdG9vbHRpcEhlaWdodCkgLSAocHJveHkub2Zmc2V0LnRvcCArIHByb3h5LmRpbWVuc2lvbi5oZWlnaHQpO1xyXG5cdFx0XHRcdFx0XHRteVRvcCA9IHByb3h5Lm9mZnNldC50b3AgLSAodG9wRGlmZmVyZW5jZSAvIDIpIC0gb2Zmc2V0WTtcclxuXHRcdFx0XHRcdH1cclxuXHRcdFx0XHRcdFx0XHJcblx0XHRcdFx0XHQvLyBpZiBpdCBvbmx5IGdvZXMgb2ZmIG9uZSBzaWRlLCBmbGlwIGl0IHRvIHRoZSBvdGhlciBzaWRlXHJcblx0XHRcdFx0XHRlbHNlIGlmKChteUxlZnQgKyB0b29sdGlwV2lkdGgpID4gd2luZG93V2lkdGgpIHtcclxuXHRcdFx0XHRcdFx0bXlMZWZ0ID0gcHJveHkub2Zmc2V0LmxlZnQgLSBvZmZzZXRYIC0gdG9vbHRpcFdpZHRoIC0gMTI7XHJcblx0XHRcdFx0XHRcdGFycm93UmVwb3NpdGlvbiA9ICdyaWdodCc7XHJcblx0XHRcdFx0XHR9XHJcblx0XHRcdFx0fVxyXG5cdFx0XHRcdFxyXG5cdFx0XHRcdC8vIGlmIGFycm93IGlzIHNldCB0cnVlLCBzdHlsZSBpdCBhbmQgYXBwZW5kIGl0XHJcblx0XHRcdFx0aWYgKHNlbGYub3B0aW9ucy5hcnJvdykge1xyXG5cdFxyXG5cdFx0XHRcdFx0dmFyIGFycm93Q2xhc3MgPSAndG9vbHRpcHN0ZXItYXJyb3ctJyArIHByYWN0aWNhbFBvc2l0aW9uO1xyXG5cdFx0XHRcdFx0XHJcblx0XHRcdFx0XHQvLyBzZXQgY29sb3Igb2YgdGhlIGFycm93XHJcblx0XHRcdFx0XHRpZihzZWxmLm9wdGlvbnMuYXJyb3dDb2xvci5sZW5ndGggPCAxKSB7XHJcblx0XHRcdFx0XHRcdHZhciBhcnJvd0NvbG9yID0gc2VsZi4kdG9vbHRpcC5jc3MoJ2JhY2tncm91bmQtY29sb3InKTtcclxuXHRcdFx0XHRcdH1cclxuXHRcdFx0XHRcdGVsc2Uge1xyXG5cdFx0XHRcdFx0XHR2YXIgYXJyb3dDb2xvciA9IHNlbGYub3B0aW9ucy5hcnJvd0NvbG9yO1xyXG5cdFx0XHRcdFx0fVxyXG5cdFx0XHRcdFx0XHJcblx0XHRcdFx0XHQvLyBpZiB0aGUgdG9vbHRpcCB3YXMgZ29pbmcgb2ZmIHRoZSBwYWdlIGFuZCBoYWQgdG8gcmUtYWRqdXN0LCB3ZSBuZWVkIHRvIHVwZGF0ZSB0aGUgYXJyb3cncyBwb3NpdGlvblxyXG5cdFx0XHRcdFx0aWYgKCFhcnJvd1JlcG9zaXRpb24pIHtcclxuXHRcdFx0XHRcdFx0YXJyb3dSZXBvc2l0aW9uID0gJyc7XHJcblx0XHRcdFx0XHR9XHJcblx0XHRcdFx0XHRlbHNlIGlmIChhcnJvd1JlcG9zaXRpb24gPT0gJ2xlZnQnKSB7XHJcblx0XHRcdFx0XHRcdGFycm93Q2xhc3MgPSAndG9vbHRpcHN0ZXItYXJyb3ctcmlnaHQnO1xyXG5cdFx0XHRcdFx0XHRhcnJvd1JlcG9zaXRpb24gPSAnJztcclxuXHRcdFx0XHRcdH1cclxuXHRcdFx0XHRcdGVsc2UgaWYgKGFycm93UmVwb3NpdGlvbiA9PSAncmlnaHQnKSB7XHJcblx0XHRcdFx0XHRcdGFycm93Q2xhc3MgPSAndG9vbHRpcHN0ZXItYXJyb3ctbGVmdCc7XHJcblx0XHRcdFx0XHRcdGFycm93UmVwb3NpdGlvbiA9ICcnO1xyXG5cdFx0XHRcdFx0fVxyXG5cdFx0XHRcdFx0ZWxzZSB7XHJcblx0XHRcdFx0XHRcdGFycm93UmVwb3NpdGlvbiA9ICdsZWZ0OicrIE1hdGgucm91bmQoYXJyb3dSZXBvc2l0aW9uKSArJ3B4Oyc7XHJcblx0XHRcdFx0XHR9XHJcblx0XHRcdFx0XHRcclxuXHRcdFx0XHRcdC8vIGJ1aWxkaW5nIHRoZSBsb2dpYyB0byBjcmVhdGUgdGhlIGJvcmRlciBhcm91bmQgdGhlIGFycm93IG9mIHRoZSB0b29sdGlwXHJcblx0XHRcdFx0XHRpZiAoKHByYWN0aWNhbFBvc2l0aW9uID09ICd0b3AnKSB8fCAocHJhY3RpY2FsUG9zaXRpb24gPT0gJ3RvcC1sZWZ0JykgfHwgKHByYWN0aWNhbFBvc2l0aW9uID09ICd0b3AtcmlnaHQnKSkge1xyXG5cdFx0XHRcdFx0XHR2YXIgdG9vbHRpcEJvcmRlcldpZHRoID0gcGFyc2VGbG9hdChzZWxmLiR0b29sdGlwLmNzcygnYm9yZGVyLWJvdHRvbS13aWR0aCcpKSxcclxuXHRcdFx0XHRcdFx0XHR0b29sdGlwQm9yZGVyQ29sb3IgPSBzZWxmLiR0b29sdGlwLmNzcygnYm9yZGVyLWJvdHRvbS1jb2xvcicpO1xyXG5cdFx0XHRcdFx0fVxyXG5cdFx0XHRcdFx0ZWxzZSBpZiAoKHByYWN0aWNhbFBvc2l0aW9uID09ICdib3R0b20nKSB8fCAocHJhY3RpY2FsUG9zaXRpb24gPT0gJ2JvdHRvbS1sZWZ0JykgfHwgKHByYWN0aWNhbFBvc2l0aW9uID09ICdib3R0b20tcmlnaHQnKSkge1xyXG5cdFx0XHRcdFx0XHR2YXIgdG9vbHRpcEJvcmRlcldpZHRoID0gcGFyc2VGbG9hdChzZWxmLiR0b29sdGlwLmNzcygnYm9yZGVyLXRvcC13aWR0aCcpKSxcclxuXHRcdFx0XHRcdFx0XHR0b29sdGlwQm9yZGVyQ29sb3IgPSBzZWxmLiR0b29sdGlwLmNzcygnYm9yZGVyLXRvcC1jb2xvcicpO1xyXG5cdFx0XHRcdFx0fVxyXG5cdFx0XHRcdFx0ZWxzZSBpZiAocHJhY3RpY2FsUG9zaXRpb24gPT0gJ2xlZnQnKSB7XHJcblx0XHRcdFx0XHRcdHZhciB0b29sdGlwQm9yZGVyV2lkdGggPSBwYXJzZUZsb2F0KHNlbGYuJHRvb2x0aXAuY3NzKCdib3JkZXItcmlnaHQtd2lkdGgnKSksXHJcblx0XHRcdFx0XHRcdFx0dG9vbHRpcEJvcmRlckNvbG9yID0gc2VsZi4kdG9vbHRpcC5jc3MoJ2JvcmRlci1yaWdodC1jb2xvcicpO1xyXG5cdFx0XHRcdFx0fVxyXG5cdFx0XHRcdFx0ZWxzZSBpZiAocHJhY3RpY2FsUG9zaXRpb24gPT0gJ3JpZ2h0Jykge1xyXG5cdFx0XHRcdFx0XHR2YXIgdG9vbHRpcEJvcmRlcldpZHRoID0gcGFyc2VGbG9hdChzZWxmLiR0b29sdGlwLmNzcygnYm9yZGVyLWxlZnQtd2lkdGgnKSksXHJcblx0XHRcdFx0XHRcdFx0dG9vbHRpcEJvcmRlckNvbG9yID0gc2VsZi4kdG9vbHRpcC5jc3MoJ2JvcmRlci1sZWZ0LWNvbG9yJyk7XHJcblx0XHRcdFx0XHR9XHJcblx0XHRcdFx0XHRlbHNlIHtcclxuXHRcdFx0XHRcdFx0dmFyIHRvb2x0aXBCb3JkZXJXaWR0aCA9IHBhcnNlRmxvYXQoc2VsZi4kdG9vbHRpcC5jc3MoJ2JvcmRlci1ib3R0b20td2lkdGgnKSksXHJcblx0XHRcdFx0XHRcdFx0dG9vbHRpcEJvcmRlckNvbG9yID0gc2VsZi4kdG9vbHRpcC5jc3MoJ2JvcmRlci1ib3R0b20tY29sb3InKTtcclxuXHRcdFx0XHRcdH1cclxuXHRcdFx0XHRcdFxyXG5cdFx0XHRcdFx0aWYgKHRvb2x0aXBCb3JkZXJXaWR0aCA+IDEpIHtcclxuXHRcdFx0XHRcdFx0dG9vbHRpcEJvcmRlcldpZHRoKys7XHJcblx0XHRcdFx0XHR9XHJcblx0XHRcdFx0XHRcclxuXHRcdFx0XHRcdHZhciBhcnJvd0JvcmRlciA9ICcnO1xyXG5cdFx0XHRcdFx0aWYgKHRvb2x0aXBCb3JkZXJXaWR0aCAhPT0gMCkge1xyXG5cdFx0XHRcdFx0XHR2YXIgYXJyb3dCb3JkZXJTaXplID0gJycsXHJcblx0XHRcdFx0XHRcdFx0YXJyb3dCb3JkZXJDb2xvciA9ICdib3JkZXItY29sb3I6ICcrIHRvb2x0aXBCb3JkZXJDb2xvciArJzsnO1xyXG5cdFx0XHRcdFx0XHRpZiAoYXJyb3dDbGFzcy5pbmRleE9mKCdib3R0b20nKSAhPT0gLTEpIHtcclxuXHRcdFx0XHRcdFx0XHRhcnJvd0JvcmRlclNpemUgPSAnbWFyZ2luLXRvcDogLScrIE1hdGgucm91bmQodG9vbHRpcEJvcmRlcldpZHRoKSArJ3B4Oyc7XHJcblx0XHRcdFx0XHRcdH1cclxuXHRcdFx0XHRcdFx0ZWxzZSBpZiAoYXJyb3dDbGFzcy5pbmRleE9mKCd0b3AnKSAhPT0gLTEpIHtcclxuXHRcdFx0XHRcdFx0XHRhcnJvd0JvcmRlclNpemUgPSAnbWFyZ2luLWJvdHRvbTogLScrIE1hdGgucm91bmQodG9vbHRpcEJvcmRlcldpZHRoKSArJ3B4Oyc7XHJcblx0XHRcdFx0XHRcdH1cclxuXHRcdFx0XHRcdFx0ZWxzZSBpZiAoYXJyb3dDbGFzcy5pbmRleE9mKCdsZWZ0JykgIT09IC0xKSB7XHJcblx0XHRcdFx0XHRcdFx0YXJyb3dCb3JkZXJTaXplID0gJ21hcmdpbi1yaWdodDogLScrIE1hdGgucm91bmQodG9vbHRpcEJvcmRlcldpZHRoKSArJ3B4Oyc7XHJcblx0XHRcdFx0XHRcdH1cclxuXHRcdFx0XHRcdFx0ZWxzZSBpZiAoYXJyb3dDbGFzcy5pbmRleE9mKCdyaWdodCcpICE9PSAtMSkge1xyXG5cdFx0XHRcdFx0XHRcdGFycm93Qm9yZGVyU2l6ZSA9ICdtYXJnaW4tbGVmdDogLScrIE1hdGgucm91bmQodG9vbHRpcEJvcmRlcldpZHRoKSArJ3B4Oyc7XHJcblx0XHRcdFx0XHRcdH1cclxuXHRcdFx0XHRcdFx0YXJyb3dCb3JkZXIgPSAnPHNwYW4gY2xhc3M9XCJ0b29sdGlwc3Rlci1hcnJvdy1ib3JkZXJcIiBzdHlsZT1cIicrIGFycm93Qm9yZGVyU2l6ZSArJyAnKyBhcnJvd0JvcmRlckNvbG9yICsnO1wiPjwvc3Bhbj4nO1xyXG5cdFx0XHRcdFx0fVxyXG5cdFx0XHRcdFx0XHJcblx0XHRcdFx0XHQvLyBpZiB0aGUgYXJyb3cgYWxyZWFkeSBleGlzdHMsIHJlbW92ZSBhbmQgcmVwbGFjZSBpdFxyXG5cdFx0XHRcdFx0c2VsZi4kdG9vbHRpcC5maW5kKCcudG9vbHRpcHN0ZXItYXJyb3cnKS5yZW1vdmUoKTtcclxuXHRcdFx0XHRcdFxyXG5cdFx0XHRcdFx0Ly8gYnVpbGQgb3V0IHRoZSBhcnJvdyBhbmQgYXBwZW5kIGl0XHRcdFxyXG5cdFx0XHRcdFx0dmFyIGFycm93Q29uc3RydWN0ID0gJzxkaXYgY2xhc3M9XCInKyBhcnJvd0NsYXNzICsnIHRvb2x0aXBzdGVyLWFycm93XCIgc3R5bGU9XCInKyBhcnJvd1JlcG9zaXRpb24gKydcIj4nKyBhcnJvd0JvcmRlciArJzxzcGFuIHN0eWxlPVwiYm9yZGVyLWNvbG9yOicrIGFycm93Q29sb3IgKyc7XCI+PC9zcGFuPjwvZGl2Pic7XHJcblx0XHRcdFx0XHRzZWxmLiR0b29sdGlwLmFwcGVuZChhcnJvd0NvbnN0cnVjdCk7XHJcblx0XHRcdFx0fVxyXG5cdFx0XHRcdFxyXG5cdFx0XHRcdC8vIHBvc2l0aW9uIHRoZSB0b29sdGlwXHJcblx0XHRcdFx0c2VsZi4kdG9vbHRpcC5jc3Moeyd0b3AnOiBNYXRoLnJvdW5kKG15VG9wKSArICdweCcsICdsZWZ0JzogTWF0aC5yb3VuZChteUxlZnQpICsgJ3B4J30pO1xyXG5cdFx0XHR9XHJcblx0XHRcdFxyXG5cdFx0XHRyZXR1cm4gc2VsZjtcclxuXHRcdH0sXHJcblx0XHRcclxuXHRcdGVuYWJsZTogZnVuY3Rpb24oKSB7XHJcblx0XHRcdHRoaXMuZW5hYmxlZCA9IHRydWU7XHJcblx0XHRcdHJldHVybiB0aGlzO1xyXG5cdFx0fSxcclxuXHRcdFxyXG5cdFx0ZGlzYWJsZTogZnVuY3Rpb24oKSB7XHJcblx0XHRcdC8vIGhpZGUgZmlyc3QsIGluIGNhc2UgdGhlIHRvb2x0aXAgd291bGQgbm90IGRpc2FwcGVhciBvbiBpdHMgb3duIChhdXRvQ2xvc2UgZmFsc2UpXHJcblx0XHRcdHRoaXMuaGlkZSgpO1xyXG5cdFx0XHR0aGlzLmVuYWJsZWQgPSBmYWxzZTtcclxuXHRcdFx0cmV0dXJuIHRoaXM7XHJcblx0XHR9LFxyXG5cdFx0XHJcblx0XHRkZXN0cm95OiBmdW5jdGlvbigpIHtcclxuXHRcdFx0XHJcblx0XHRcdHZhciBzZWxmID0gdGhpcztcclxuXHRcdFx0XHJcblx0XHRcdHNlbGYuaGlkZSgpO1xyXG5cdFx0XHRcclxuXHRcdFx0Ly8gcmVtb3ZlIHRoZSBpY29uLCBpZiBhbnlcclxuXHRcdFx0aWYgKHNlbGYuJGVsWzBdICE9PSBzZWxmLiRlbFByb3h5WzBdKSB7XHJcblx0XHRcdFx0c2VsZi4kZWxQcm94eS5yZW1vdmUoKTtcclxuXHRcdFx0fVxyXG5cdFx0XHRcclxuXHRcdFx0c2VsZi4kZWxcclxuXHRcdFx0XHQucmVtb3ZlRGF0YShzZWxmLm5hbWVzcGFjZSlcclxuXHRcdFx0XHQub2ZmKCcuJysgc2VsZi5uYW1lc3BhY2UpO1xyXG5cdFx0XHRcclxuXHRcdFx0dmFyIG5zID0gc2VsZi4kZWwuZGF0YSgndG9vbHRpcHN0ZXItbnMnKTtcclxuXHRcdFx0XHJcblx0XHRcdC8vIGlmIHRoZXJlIGFyZSBubyBtb3JlIHRvb2x0aXBzIG9uIHRoaXMgZWxlbWVudFxyXG5cdFx0XHRpZihucy5sZW5ndGggPT09IDEpe1xyXG5cdFx0XHRcdFxyXG5cdFx0XHRcdC8vIG9wdGlvbmFsIHJlc3RvcmF0aW9uIG9mIGEgdGl0bGUgYXR0cmlidXRlXHJcblx0XHRcdFx0dmFyIHRpdGxlID0gbnVsbDtcclxuXHRcdFx0XHRpZiAoc2VsZi5vcHRpb25zLnJlc3RvcmF0aW9uID09PSAncHJldmlvdXMnKXtcclxuXHRcdFx0XHRcdHRpdGxlID0gc2VsZi4kZWwuZGF0YSgndG9vbHRpcHN0ZXItaW5pdGlhbFRpdGxlJyk7XHJcblx0XHRcdFx0fVxyXG5cdFx0XHRcdGVsc2UgaWYoc2VsZi5vcHRpb25zLnJlc3RvcmF0aW9uID09PSAnY3VycmVudCcpe1xyXG5cdFx0XHRcdFx0XHJcblx0XHRcdFx0XHQvLyBvbGQgc2Nob29sIHRlY2huaXF1ZSB0byBzdHJpbmdpZnkgd2hlbiBvdXRlckhUTUwgaXMgbm90IHN1cHBvcnRlZFxyXG5cdFx0XHRcdFx0dGl0bGUgPVxyXG5cdFx0XHRcdFx0XHQodHlwZW9mIHNlbGYuQ29udGVudCA9PT0gJ3N0cmluZycpID9cclxuXHRcdFx0XHRcdFx0c2VsZi5Db250ZW50IDpcclxuXHRcdFx0XHRcdFx0JCgnPGRpdj48L2Rpdj4nKS5hcHBlbmQoc2VsZi5Db250ZW50KS5odG1sKCk7XHJcblx0XHRcdFx0fVxyXG5cdFx0XHRcdFxyXG5cdFx0XHRcdGlmICh0aXRsZSkge1xyXG5cdFx0XHRcdFx0c2VsZi4kZWwuYXR0cigndGl0bGUnLCB0aXRsZSk7XHJcblx0XHRcdFx0fVxyXG5cdFx0XHRcdFxyXG5cdFx0XHRcdC8vIGZpbmFsIGNsZWFuaW5nXHJcblx0XHRcdFx0c2VsZi4kZWxcclxuXHRcdFx0XHRcdC5yZW1vdmVDbGFzcygndG9vbHRpcHN0ZXJlZCcpXHJcblx0XHRcdFx0XHQucmVtb3ZlRGF0YSgndG9vbHRpcHN0ZXItbnMnKVxyXG5cdFx0XHRcdFx0LnJlbW92ZURhdGEoJ3Rvb2x0aXBzdGVyLWluaXRpYWxUaXRsZScpO1xyXG5cdFx0XHR9XHJcblx0XHRcdGVsc2Uge1xyXG5cdFx0XHRcdC8vIHJlbW92ZSB0aGUgaW5zdGFuY2UgbmFtZXNwYWNlIGZyb20gdGhlIGxpc3Qgb2YgbmFtZXNwYWNlcyBvZiB0b29sdGlwcyBwcmVzZW50IG9uIHRoZSBlbGVtZW50XHJcblx0XHRcdFx0bnMgPSAkLmdyZXAobnMsIGZ1bmN0aW9uKGVsLCBpKXtcclxuXHRcdFx0XHRcdHJldHVybiBlbCAhPT0gc2VsZi5uYW1lc3BhY2U7XHJcblx0XHRcdFx0fSk7XHJcblx0XHRcdFx0c2VsZi4kZWwuZGF0YSgndG9vbHRpcHN0ZXItbnMnLCBucyk7XHJcblx0XHRcdH1cclxuXHRcdFx0XHJcblx0XHRcdHJldHVybiBzZWxmO1xyXG5cdFx0fSxcclxuXHRcdFxyXG5cdFx0ZWxlbWVudEljb246IGZ1bmN0aW9uKCkge1xyXG5cdFx0XHRyZXR1cm4gKHRoaXMuJGVsWzBdICE9PSB0aGlzLiRlbFByb3h5WzBdKSA/IHRoaXMuJGVsUHJveHlbMF0gOiB1bmRlZmluZWQ7XHJcblx0XHR9LFxyXG5cdFx0XHJcblx0XHRlbGVtZW50VG9vbHRpcDogZnVuY3Rpb24oKSB7XHJcblx0XHRcdHJldHVybiB0aGlzLiR0b29sdGlwID8gdGhpcy4kdG9vbHRpcFswXSA6IHVuZGVmaW5lZDtcclxuXHRcdH0sXHJcblx0XHRcclxuXHRcdC8vIHB1YmxpYyBtZXRob2RzIGJ1dCBmb3IgaW50ZXJuYWwgdXNlIG9ubHlcblx0XHQvLyBnZXR0ZXIgaWYgdmFsIGlzIG9tbWl0dGVkLCBzZXR0ZXIgb3RoZXJ3aXNlXHJcblx0XHRvcHRpb246IGZ1bmN0aW9uKG8sIHZhbCkge1xuXHRcdFx0aWYgKHR5cGVvZiB2YWwgPT0gJ3VuZGVmaW5lZCcpIHJldHVybiB0aGlzLm9wdGlvbnNbb107XHJcblx0XHRcdGVsc2Uge1xuXHRcdFx0XHR0aGlzLm9wdGlvbnNbb10gPSB2YWw7XG5cdFx0XHRcdHJldHVybiB0aGlzO1xuXHRcdFx0fVxyXG5cdFx0fSxcclxuXHRcdHN0YXR1czogZnVuY3Rpb24oKSB7XHJcblx0XHRcdHJldHVybiB0aGlzLlN0YXR1cztcclxuXHRcdH1cclxuXHR9O1xyXG5cdFxyXG5cdCQuZm5bcGx1Z2luTmFtZV0gPSBmdW5jdGlvbiAoKSB7XHJcblx0XHRcclxuXHRcdC8vIGZvciB1c2luZyBpbiBjbG9zdXJlc1xyXG5cdFx0dmFyIGFyZ3MgPSBhcmd1bWVudHM7XHJcblx0XHRcclxuXHRcdC8vIGlmIHdlIGFyZSBub3QgaW4gdGhlIGNvbnRleHQgb2YgalF1ZXJ5IHdyYXBwZWQgSFRNTCBlbGVtZW50KHMpIDpcclxuXHRcdC8vIHRoaXMgaGFwcGVucyB3aGVuIGNhbGxpbmcgc3RhdGljIG1ldGhvZHMgaW4gdGhlIGZvcm0gJC5mbi50b29sdGlwc3RlcignbWV0aG9kTmFtZScpLCBvciB3aGVuIGNhbGxpbmcgJChzZWwpLnRvb2x0aXBzdGVyKCdtZXRob2ROYW1lIG9yIG9wdGlvbnMnKSB3aGVyZSAkKHNlbCkgZG9lcyBub3QgbWF0Y2ggYW55dGhpbmdcclxuXHRcdGlmICh0aGlzLmxlbmd0aCA9PT0gMCkge1xyXG5cdFx0XHRcclxuXHRcdFx0Ly8gaWYgdGhlIGZpcnN0IGFyZ3VtZW50IGlzIGEgbWV0aG9kIG5hbWVcclxuXHRcdFx0aWYgKHR5cGVvZiBhcmdzWzBdID09PSAnc3RyaW5nJykge1xyXG5cdFx0XHRcdFxyXG5cdFx0XHRcdHZhciBtZXRob2RJc1N0YXRpYyA9IHRydWU7XHJcblx0XHRcdFx0XHJcblx0XHRcdFx0Ly8gbGlzdCBzdGF0aWMgbWV0aG9kcyBoZXJlICh1c2FibGUgYnkgY2FsbGluZyAkLmZuLnRvb2x0aXBzdGVyKCdtZXRob2ROYW1lJyk7KVxyXG5cdFx0XHRcdHN3aXRjaCAoYXJnc1swXSkge1xyXG5cdFx0XHRcdFx0XHJcblx0XHRcdFx0XHRjYXNlICdzZXREZWZhdWx0cyc6XHJcblx0XHRcdFx0XHRcdC8vIGNoYW5nZSBkZWZhdWx0IG9wdGlvbnMgZm9yIGFsbCBmdXR1cmUgaW5zdGFuY2VzXHJcblx0XHRcdFx0XHRcdCQuZXh0ZW5kKGRlZmF1bHRzLCBhcmdzWzFdKTtcclxuXHRcdFx0XHRcdFx0YnJlYWs7XHJcblx0XHRcdFx0XHRcclxuXHRcdFx0XHRcdGRlZmF1bHQ6XHJcblx0XHRcdFx0XHRcdG1ldGhvZElzU3RhdGljID0gZmFsc2U7XHJcblx0XHRcdFx0XHRcdGJyZWFrO1xyXG5cdFx0XHRcdH1cclxuXHRcdFx0XHRcclxuXHRcdFx0XHQvLyAkLmZuLnRvb2x0aXBzdGVyKCdtZXRob2ROYW1lJykgY2FsbHMgd2lsbCByZXR1cm4gdHJ1ZVxyXG5cdFx0XHRcdGlmIChtZXRob2RJc1N0YXRpYykgcmV0dXJuIHRydWU7XHJcblx0XHRcdFx0Ly8gJChzZWwpLnRvb2x0aXBzdGVyKCdtZXRob2ROYW1lJykgY2FsbHMgd2lsbCByZXR1cm4gdGhlIGxpc3Qgb2Ygb2JqZWN0cyBldmVudCB0aG91Z2ggaXQncyBlbXB0eSBiZWNhdXNlIGNoYWluaW5nIHNob3VsZCB3b3JrIG9uIGVtcHR5IGxpc3RzXHJcblx0XHRcdFx0ZWxzZSByZXR1cm4gdGhpcztcclxuXHRcdFx0fVxyXG5cdFx0XHQvLyB0aGUgZmlyc3QgYXJndW1lbnQgaXMgdW5kZWZpbmVkIG9yIGFuIG9iamVjdCBvZiBvcHRpb25zIDogd2UgYXJlIGluaXRhbGl6aW5nIGJ1dCB0aGVyZSBpcyBubyBlbGVtZW50IG1hdGNoZWQgYnkgc2VsZWN0b3JcclxuXHRcdFx0ZWxzZSB7XHJcblx0XHRcdFx0Ly8gc3RpbGwgY2hhaW5hYmxlIDogc2FtZSBhcyBhYm92ZVxyXG5cdFx0XHRcdHJldHVybiB0aGlzO1xyXG5cdFx0XHR9XHJcblx0XHR9XHJcblx0XHQvLyB0aGlzIGhhcHBlbnMgd2hlbiBjYWxsaW5nICQoc2VsKS50b29sdGlwc3RlcignbWV0aG9kTmFtZSBvciBvcHRpb25zJykgd2hlcmUgJChzZWwpIG1hdGNoZXMgb25lIG9yIG1vcmUgZWxlbWVudHNcclxuXHRcdGVsc2Uge1xyXG5cdFx0XHRcclxuXHRcdFx0Ly8gbWV0aG9kIGNhbGxzXHJcblx0XHRcdGlmICh0eXBlb2YgYXJnc1swXSA9PT0gJ3N0cmluZycpIHtcclxuXHRcdFx0XHRcclxuXHRcdFx0XHR2YXIgdiA9ICcjKiR+Jic7XHJcblx0XHRcdFx0XHJcblx0XHRcdFx0dGhpcy5lYWNoKGZ1bmN0aW9uKCkge1xyXG5cdFx0XHRcdFx0XHJcblx0XHRcdFx0XHQvLyByZXRyaWV2ZSB0aGUgbmFtZXBhY2VzIG9mIHRoZSB0b29sdGlwKHMpIHRoYXQgZXhpc3Qgb24gdGhhdCBlbGVtZW50LiBXZSB3aWxsIGludGVyYWN0IHdpdGggdGhlIGZpcnN0IHRvb2x0aXAgb25seS5cclxuXHRcdFx0XHRcdHZhciBucyA9ICQodGhpcykuZGF0YSgndG9vbHRpcHN0ZXItbnMnKSxcclxuXHRcdFx0XHRcdFx0Ly8gc2VsZiByZXByZXNlbnRzIHRoZSBpbnN0YW5jZSBvZiB0aGUgZmlyc3QgdG9vbHRpcHN0ZXIgcGx1Z2luIGFzc29jaWF0ZWQgdG8gdGhlIGN1cnJlbnQgSFRNTCBvYmplY3Qgb2YgdGhlIGxvb3BcclxuXHRcdFx0XHRcdFx0c2VsZiA9IG5zID8gJCh0aGlzKS5kYXRhKG5zWzBdKSA6IG51bGw7XHJcblx0XHRcdFx0XHRcclxuXHRcdFx0XHRcdC8vIGlmIHRoZSBjdXJyZW50IGVsZW1lbnQgaG9sZHMgYSB0b29sdGlwc3RlciBpbnN0YW5jZVxyXG5cdFx0XHRcdFx0aWYgKHNlbGYpIHtcclxuXHRcdFx0XHRcdFx0XHJcblx0XHRcdFx0XHRcdGlmICh0eXBlb2Ygc2VsZlthcmdzWzBdXSA9PT0gJ2Z1bmN0aW9uJykge1xuXHRcdFx0XHRcdFx0XHQvLyBub3RlIDogYXJnc1sxXSBhbmQgYXJnc1syXSBtYXkgbm90IGJlIGRlZmluZWRcclxuXHRcdFx0XHRcdFx0XHR2YXIgcmVzcCA9IHNlbGZbYXJnc1swXV0oYXJnc1sxXSwgYXJnc1syXSk7XHJcblx0XHRcdFx0XHRcdH1cclxuXHRcdFx0XHRcdFx0ZWxzZSB7XHJcblx0XHRcdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdVbmtub3duIG1ldGhvZCAudG9vbHRpcHN0ZXIoXCInICsgYXJnc1swXSArICdcIiknKTtcclxuXHRcdFx0XHRcdFx0fVxyXG5cdFx0XHRcdFx0XHRcclxuXHRcdFx0XHRcdFx0Ly8gaWYgdGhlIGZ1bmN0aW9uIHJldHVybmVkIGFueXRoaW5nIG90aGVyIHRoYW4gdGhlIGluc3RhbmNlIGl0c2VsZiAod2hpY2ggaW1wbGllcyBjaGFpbmluZylcclxuXHRcdFx0XHRcdFx0aWYgKHJlc3AgIT09IHNlbGYpe1xyXG5cdFx0XHRcdFx0XHRcdHYgPSByZXNwO1xyXG5cdFx0XHRcdFx0XHRcdC8vIHJldHVybiBmYWxzZSB0byBzdG9wIC5lYWNoIGl0ZXJhdGlvbiBvbiB0aGUgZmlyc3QgZWxlbWVudCBtYXRjaGVkIGJ5IHRoZSBzZWxlY3RvclxyXG5cdFx0XHRcdFx0XHRcdHJldHVybiBmYWxzZTtcclxuXHRcdFx0XHRcdFx0fVxyXG5cdFx0XHRcdFx0fVxyXG5cdFx0XHRcdFx0ZWxzZSB7XHJcblx0XHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcignWW91IGNhbGxlZCBUb29sdGlwc3RlclxcJ3MgXCInICsgYXJnc1swXSArICdcIiBtZXRob2Qgb24gYW4gdW5pbml0aWFsaXplZCBlbGVtZW50Jyk7XHJcblx0XHRcdFx0XHR9XHJcblx0XHRcdFx0fSk7XHJcblx0XHRcdFx0XHJcblx0XHRcdFx0cmV0dXJuICh2ICE9PSAnIyokfiYnKSA/IHYgOiB0aGlzO1xyXG5cdFx0XHR9XHJcblx0XHRcdC8vIGZpcnN0IGFyZ3VtZW50IGlzIHVuZGVmaW5lZCBvciBhbiBvYmplY3QgOiB0aGUgdG9vbHRpcCBpcyBpbml0aWFsaXppbmdcclxuXHRcdFx0ZWxzZSB7XHJcblx0XHRcdFx0XHJcblx0XHRcdFx0dmFyIGluc3RhbmNlcyA9IFtdLFxyXG5cdFx0XHRcdFx0Ly8gaXMgdGhlcmUgYSBkZWZpbmVkIHZhbHVlIGZvciB0aGUgbXVsdGlwbGUgb3B0aW9uIGluIHRoZSBvcHRpb25zIG9iamVjdCA/XHJcblx0XHRcdFx0XHRtdWx0aXBsZUlzU2V0ID0gYXJnc1swXSAmJiB0eXBlb2YgYXJnc1swXS5tdWx0aXBsZSAhPT0gJ3VuZGVmaW5lZCcsXHJcblx0XHRcdFx0XHQvLyBpZiB0aGUgbXVsdGlwbGUgb3B0aW9uIGlzIHNldCB0byB0cnVlLCBvciBpZiBpdCdzIG5vdCBkZWZpbmVkIGJ1dCBzZXQgdG8gdHJ1ZSBpbiB0aGUgZGVmYXVsdHNcclxuXHRcdFx0XHRcdG11bHRpcGxlID0gKG11bHRpcGxlSXNTZXQgJiYgYXJnc1swXS5tdWx0aXBsZSkgfHwgKCFtdWx0aXBsZUlzU2V0ICYmIGRlZmF1bHRzLm11bHRpcGxlKSxcclxuXHRcdFx0XHRcdC8vIHNhbWUgZm9yIGRlYnVnXHJcblx0XHRcdFx0XHRkZWJ1Z0lzU2V0ID0gYXJnc1swXSAmJiB0eXBlb2YgYXJnc1swXS5kZWJ1ZyAhPT0gJ3VuZGVmaW5lZCcsXHJcblx0XHRcdFx0XHRkZWJ1ZyA9IChkZWJ1Z0lzU2V0ICYmIGFyZ3NbMF0uZGVidWcpIHx8ICghZGVidWdJc1NldCAmJiBkZWZhdWx0cy5kZWJ1Zyk7XHJcblx0XHRcdFx0XHJcblx0XHRcdFx0Ly8gaW5pdGlhbGl6ZSBhIHRvb2x0aXBzdGVyIGluc3RhbmNlIGZvciBlYWNoIGVsZW1lbnQgaWYgaXQgZG9lc24ndCBhbHJlYWR5IGhhdmUgb25lIG9yIGlmIHRoZSBtdWx0aXBsZSBvcHRpb24gaXMgc2V0LCBhbmQgYXR0YWNoIHRoZSBvYmplY3QgdG8gaXRcclxuXHRcdFx0XHR0aGlzLmVhY2goZnVuY3Rpb24gKCkge1xyXG5cdFx0XHRcdFx0XHJcblx0XHRcdFx0XHR2YXIgZ28gPSBmYWxzZSxcclxuXHRcdFx0XHRcdFx0bnMgPSAkKHRoaXMpLmRhdGEoJ3Rvb2x0aXBzdGVyLW5zJyksXHJcblx0XHRcdFx0XHRcdGluc3RhbmNlID0gbnVsbDtcclxuXHRcdFx0XHRcdFxyXG5cdFx0XHRcdFx0aWYgKCFucykge1xyXG5cdFx0XHRcdFx0XHRnbyA9IHRydWU7XHJcblx0XHRcdFx0XHR9XHJcblx0XHRcdFx0XHRlbHNlIGlmIChtdWx0aXBsZSkge1xyXG5cdFx0XHRcdFx0XHRnbyA9IHRydWU7XHJcblx0XHRcdFx0XHR9XHJcblx0XHRcdFx0XHRlbHNlIGlmIChkZWJ1Zykge1xyXG5cdFx0XHRcdFx0XHRjb25zb2xlLmxvZygnVG9vbHRpcHN0ZXI6IG9uZSBvciBtb3JlIHRvb2x0aXBzIGFyZSBhbHJlYWR5IGF0dGFjaGVkIHRvIHRoaXMgZWxlbWVudDogaWdub3JpbmcuIFVzZSB0aGUgXCJtdWx0aXBsZVwiIG9wdGlvbiB0byBhdHRhY2ggbW9yZSB0b29sdGlwcy4nKTtcclxuXHRcdFx0XHRcdH1cclxuXHRcdFx0XHRcdFxyXG5cdFx0XHRcdFx0aWYgKGdvKSB7XHJcblx0XHRcdFx0XHRcdGluc3RhbmNlID0gbmV3IFBsdWdpbih0aGlzLCBhcmdzWzBdKTtcclxuXHRcdFx0XHRcdFx0XHJcblx0XHRcdFx0XHRcdC8vIHNhdmUgdGhlIHJlZmVyZW5jZSBvZiB0aGUgbmV3IGluc3RhbmNlXHJcblx0XHRcdFx0XHRcdGlmICghbnMpIG5zID0gW107XHJcblx0XHRcdFx0XHRcdG5zLnB1c2goaW5zdGFuY2UubmFtZXNwYWNlKTtcclxuXHRcdFx0XHRcdFx0JCh0aGlzKS5kYXRhKCd0b29sdGlwc3Rlci1ucycsIG5zKVxyXG5cdFx0XHRcdFx0XHRcclxuXHRcdFx0XHRcdFx0Ly8gc2F2ZSB0aGUgaW5zdGFuY2UgaXRzZWxmXHJcblx0XHRcdFx0XHRcdCQodGhpcykuZGF0YShpbnN0YW5jZS5uYW1lc3BhY2UsIGluc3RhbmNlKTtcclxuXHRcdFx0XHRcdH1cclxuXHRcdFx0XHRcdFxyXG5cdFx0XHRcdFx0aW5zdGFuY2VzLnB1c2goaW5zdGFuY2UpO1xyXG5cdFx0XHRcdH0pO1xyXG5cdFx0XHRcdFxyXG5cdFx0XHRcdGlmIChtdWx0aXBsZSkgcmV0dXJuIGluc3RhbmNlcztcclxuXHRcdFx0XHRlbHNlIHJldHVybiB0aGlzO1xyXG5cdFx0XHR9XHJcblx0XHR9XHJcblx0fTtcclxuXHRcclxuXHQvLyBxdWljayAmIGRpcnR5IGNvbXBhcmUgZnVuY3Rpb24gKG5vdCBiaWplY3RpdmUgbm9yIG11bHRpZGltZW5zaW9uYWwpXHJcblx0ZnVuY3Rpb24gYXJlRXF1YWwoYSxiKSB7XHJcblx0XHR2YXIgc2FtZSA9IHRydWU7XHJcblx0XHQkLmVhY2goYSwgZnVuY3Rpb24oaSwgZWwpe1xyXG5cdFx0XHRpZih0eXBlb2YgYltpXSA9PT0gJ3VuZGVmaW5lZCcgfHwgYVtpXSAhPT0gYltpXSl7XHJcblx0XHRcdFx0c2FtZSA9IGZhbHNlO1xyXG5cdFx0XHRcdHJldHVybiBmYWxzZTtcclxuXHRcdFx0fVxyXG5cdFx0fSk7XHJcblx0XHRyZXR1cm4gc2FtZTtcclxuXHR9XHJcblx0XHJcblx0Ly8gZGV0ZWN0IGlmIHRoaXMgZGV2aWNlIGNhbiB0cmlnZ2VyIHRvdWNoIGV2ZW50c1xyXG5cdHZhciBkZXZpY2VIYXNUb3VjaENhcGFiaWxpdHkgPSAhISgnb250b3VjaHN0YXJ0JyBpbiB3aW5kb3cpO1xyXG5cdFxyXG5cdC8vIHdlJ2xsIGFzc3VtZSB0aGUgZGV2aWNlIGhhcyBubyBtb3VzZSB1bnRpbCB3ZSBkZXRlY3QgYW55IG1vdXNlIG1vdmVtZW50XHJcblx0dmFyIGRldmljZUhhc01vdXNlID0gZmFsc2U7XHJcblx0JCgnYm9keScpLm9uZSgnbW91c2Vtb3ZlJywgZnVuY3Rpb24oKSB7XHJcblx0XHRkZXZpY2VIYXNNb3VzZSA9IHRydWU7XHJcblx0fSk7XHJcblx0XHJcblx0ZnVuY3Rpb24gZGV2aWNlSXNQdXJlVG91Y2goKSB7XHJcblx0XHRyZXR1cm4gKCFkZXZpY2VIYXNNb3VzZSAmJiBkZXZpY2VIYXNUb3VjaENhcGFiaWxpdHkpO1xyXG5cdH1cclxuXHRcclxuXHQvLyBkZXRlY3Rpbmcgc3VwcG9ydCBmb3IgQ1NTIHRyYW5zaXRpb25zXHJcblx0ZnVuY3Rpb24gc3VwcG9ydHNUcmFuc2l0aW9ucygpIHtcclxuXHRcdHZhciBiID0gZG9jdW1lbnQuYm9keSB8fCBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQsXHJcblx0XHRcdHMgPSBiLnN0eWxlLFxyXG5cdFx0XHRwID0gJ3RyYW5zaXRpb24nO1xyXG5cdFx0XHJcblx0XHRpZih0eXBlb2Ygc1twXSA9PSAnc3RyaW5nJykge3JldHVybiB0cnVlOyB9XHJcblxyXG5cdFx0diA9IFsnTW96JywgJ1dlYmtpdCcsICdLaHRtbCcsICdPJywgJ21zJ10sXHJcblx0XHRwID0gcC5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIHAuc3Vic3RyKDEpO1xyXG5cdFx0Zm9yKHZhciBpPTA7IGk8di5sZW5ndGg7IGkrKykge1xyXG5cdFx0XHRpZih0eXBlb2Ygc1t2W2ldICsgcF0gPT0gJ3N0cmluZycpIHsgcmV0dXJuIHRydWU7IH1cclxuXHRcdH1cclxuXHRcdHJldHVybiBmYWxzZTtcclxuXHR9XHJcbn0pKCBqUXVlcnksIHdpbmRvdywgZG9jdW1lbnQgKTtcclxuIl19
