/*
 * Copyright (c) 2014-2015 CoNWeT Lab., Universidad Politécnica de Madrid
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/* global $, MockMP */


(function () {

    "use strict";

    var dependencyList = [
        'script',
        'div#jasmine-fixtures',
        'div.jasmine_html-reporter'
    ];

    var clearDocument = function clearDocument() {
        $('body > *:not(' + dependencyList.join(', ') + ')').remove();
    };

    var getWiringCallback = function getWiringCallback(endpoint) {
        var calls = MashupPlatform.wiring.registerCallback.calls;
        var count = calls.count();
        for (var i = count - 1; i >= 0; i--) {
            var args = calls.argsFor(i);
            if (args[0] === endpoint) {
                return args[1];
            }
        }
        return null;
    };

    window.MashupPlatform = new MockMP.MockMP();

    describe("CKAN Resource Selector widget", function () {

        var widget = null;

        beforeEach(function () {
            clearDocument();

            widget = new Widget();
        });

        afterEach(function () {
            MashupPlatform.reset();
        });

        describe("", function () {

            beforeEach(function () {
                widget.init();
            });

            it("registers a widget context callback", function () {
                expect(MashupPlatform.widget.context.registerCallback).toHaveBeenCalledWith(jasmine.any(Function));
            });

            it("redraw the graph container when the horizontal is resized", function () {
                spyOn(widget.layout, 'repaint').and.callThrough();

                var pref_callback = MashupPlatform.widget.context.registerCallback.calls.argsFor(0)[0];
                pref_callback({widthInPixels: 100});
                expect(widget.layout.repaint).toHaveBeenCalled();
            });

            it("redraw the graph container when the vertical is resized", function () {
                spyOn(widget.layout, 'repaint').and.callThrough();

                var pref_callback = MashupPlatform.widget.context.registerCallback.calls.argsFor(0)[0];
                pref_callback({heightInPixels: 100});
                expect(widget.layout.repaint).toHaveBeenCalled();
            });

        });

        it("handles dataset tags", function () {
            MashupPlatform.setStrategy({
                'http.makeRequest': function (url, options) {
                    options.onSuccess({
                        responseText: '{"result": {"results": [{"private": false, "tags": [{"display_name": "oneTag", "name": "onetag"}]}]}}'
                    })
                }
            });

            widget.init();

            var dataset = widget.layout.wrapperElement.querySelector('.panel');
            var tags = dataset.querySelectorAll('.panel-footer .label');
            expect(tags.length).toBe(1);
            expect(tags[0].textContent).toBe("oneTag");
            tags[0].click();
            var searchinput = widget.layout.wrapperElement.querySelector('input');
            expect(searchinput.value).toBe('tags:onetag')
        });

        it("handles private datasets", function () {
            MashupPlatform.setStrategy({
                'http.makeRequest': function (url, options) {
                    options.onSuccess({
                        responseText: '{"result": {"results": [{"private": true, "tags": []}]}}'
                    })
                }
            });

            widget.init();

            var dataset = widget.layout.wrapperElement.querySelector('.panel');
            expect(dataset.className).toContain('disabled');
            var label = dataset.querySelector('.label');
            expect(label.textContent).toBe('PRIVATE');
        });

        it("handles adquired datasets", function () {
            MashupPlatform.setStrategy({
                'http.makeRequest': function (url, options) {
                    options.onSuccess({
                        responseText: '{"result": {"results": [{"private": true, "resources": [], "tags": []}]}}'
                    })
                }
            });

            widget.init();

            var dataset = widget.layout.wrapperElement.querySelector('.panel');
            expect(dataset.className).not.toContain('disabled');
            var label = dataset.querySelector('.label');
            expect(label.textContent).toBe('ADQUIRED');
        });

    });

})();
