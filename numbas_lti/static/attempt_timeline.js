var DateTime = luxon.DateTime;

var _ = gettext;

function percentage(n) {
    return Math.floor(100*n)+'%';
}

function pluralise(n,single,plural) {
    n = parseFloat(n);
    return n==1 ? single : plural;
}

function parse_part_path(path) {
    var m = path.match(/^q(\d+)(?:p(\d+)(?:g(\d+)|s(\d+))?)?$/);
    if(!m) {
        throw(new Error(interpolate("Can't parse part path %s"),[path]));
    }
    return {
        question: parseInt(m[1]),
        part: parseInt(m[2]),
        gap: parseInt(m[3]),
        step: parseInt(m[4])
    };
}

function score_icon(score,marks) {
    return marks==0 ? '' : score<marks ? 'remove' : 'ok'
}

function Timeline(elements, remarked_elements, launches) {
    var tl = this;
    this.question = ko.observable(0);
    this.raw_score = ko.observable(0);
    this.scaled_score = ko.observable(0);
    this.completion_status = ko.observable('');

    this.raw_elements = elements;
    this.remarked_elements = remarked_elements;
    this.all_elements = ko.observableArray([]);
    this.timeline = ko.observableArray([]);

    elements.forEach(this.add_element,this);

    this.launches = launches;

    launches.forEach(this.add_launch, this);

    this.grouped_timeline = ko.computed(function() {
        var timeline = this.timeline().sort(function(a,b) {
            a = a.time;
            b = b.time;
            return a<b ? -1 : a>b ? 1 : 0;
        });
        var groups = [];
        var current_group = null;
        timeline.forEach(function(item) {
            var remarked_by = item.element.remarked ? item.element.remarked.user : null;
            if(current_group==null || item.time.diff(current_group.time).as('seconds')>1 || current_group.remarked_by != remarked_by) {
                current_group = {
                    time: item.time,
                    remarked_by: remarked_by,
                    items: []
                }
                groups.push(current_group);
            }
            current_group.items.push(item);
        });
        var item_order = [
            'launch',
            'scorm part answer',
            'scorm part score',
            'scorm question score raw',
            'scorm exam score raw',
            'scorm completion_status',
            'scorm location',
            'scorm suspend_data'
        ];
        function score_for_item(item) {
            return item_order.indexOf(item.kind);
        }
        var previous_exam_score = NaN;
        groups.forEach(function(g) {
            if(g.items.length) {
                var element_items = g.items.filter(function(i){ return i.css.scorm });
                var element = element_items.length ? element_items[element_items.length-1].element : {time: g.items[g.items.length-1].time, counter: Infinity};
                g.exam_raw_score = parseFloat(tl.element_at('cmi.score.raw',element) || 0);
                g.exam_max_score = parseFloat(tl.element_at('cmi.score.max',element) || 0);
                var exam_scaled_score = parseFloat(tl.element_at('cmi.score.scaled',element) || 0);
                g.exam_scaled_score = percentage(exam_scaled_score);
                if(g.exam_raw_score!=previous_exam_score) {
                    g.exam_score_changed = true;
                    previous_exam_score = g.exam_raw_score;
                }
            }
            g.items.sort(function(a,b) {
                a = score_for_item(a);
                b = score_for_item(b);
                return a<b ? -1 : a>b ? 1 : 0;
            });
        });
        return groups;
    },this);
}
Timeline.prototype = {
    element_at: function(key,element) {
        var t,counter;
        if(!element) {
            t = Infinity;
            counter = Infinity;
        } else {
            t = (new Date(element.time))-0;
            counter = element.counter;
        }
        var value;
        this.all_elements().forEach(function(e) {
            var et = (new Date(e.time))-0;
            if(e.key==key && (et<t || et==t && e.counter<counter)) {
                value = e.value;
            }
        });
        return value;
    },
    datamodel_at: function(element) {
        var t,counter;
        if(!element) {
            t = Infinity;
            counter = Infinity;
        } else {
            t = (new Date(element.time))-0;
            counter = element.counter;
        }
        var datamodel = {};
        this.all_elements().forEach(function(e) {
            var et = (new Date(e.time))-0;
            if(et<t || et==t && e.counter<counter) {
                datamodel[e.key] = e.value;
            }
        });
        return datamodel;
    },

    suspend_data_at: function(element) {
        var json_suspend_data = this.element_at('cmi.suspend_data',element);
        if(json_suspend_data) {
            return JSON.parse(json_suspend_data);
        } else {
            return {}
        }
    },

    getPart: function(id,element) {
        var id_key = 'cmi.interactions.'+id+'.id';
        var path = this.element_at(id_key,element);
        if(!path) {
            return {
                id: id,
                name: 'Part with id '+id,
                path: '',
                marks: 0
            };
        }
        var desc = parse_part_path(path);
        var suspend_data = this.suspend_data_at(element);
        var part;
        try {
            var p = suspend_data.questions[desc.question].parts[desc.part];
            if(!isNaN(desc.gap)) {
                p = p.gaps[desc.gap];
            } else if(!isNaN(desc.step)) {
                p = p.steps[desc.step];
            }
            var part_type = this.element_at('cmi.interactions.'+id+'.description',element);
            var marks = parseFloat(this.element_at('cmi.interactions.'+id+'.weighting',element));
            part = {
                id: id,
                name: p.name || path,
                path: path,
                type: part_type,
                marks: marks
            }
        } catch(e) {
            part = {
                id: id,
                name: path,
                path: path,
                marks: 0
            }
        }
        part.name = 'Question '+(desc.question+1)+', '+part.name;
        return part;
    },

    has_started: function(element) {
        var s = this.suspend_data_at(element);
        return s.start!==undefined;
    },

    add_element: function(element) {
        var key = element.key
        this.all_elements.push(element);
        element.remarked = this.remarked_elements.find(function(r) { return r.element == element.pk; });

        var m;

        if(key=='cmi.completion_status') {
            this.completion_status(element.value);
            var messages = {
                'incomplete': _('Started the attempt.'),
                'completed': _('Ended the attempt.'),
            };
            var message = messages[element.value];
            var icons = {
                'incomplete': 'open',
                'completed': 'saved'
            }
            var icon = icons[element.value];
            if(message) {
                this.add_timeline_item(new TimelineItem(
                    message,
                    element,
                    'scorm completion_status',
                    icon
                ));
            }
            return;
        }

        if(!this.has_started(element)) {
            return;
        }

        if(key=='cmi.location') {
            var number = parseInt(element.value);
            this.add_timeline_item(new TimelineItem(
                interpolate(_('Moved to <em class="question">Question %s</em>.'),[number+1]),
                element,
                'scorm location',
                'list'
            ));
            this.question(number);
        } else if(m = key.match(/^cmi.interactions.(\d+).learner_response$/)) {
            var id = parseInt(m[1]);
            var p = this.getPart(id,element);
            if(p.type!=='gapfill' && element.value!='undefined') {
                this.add_timeline_item(new TimelineItem(
                    interpolate(_('Submitted answer <code>%s</code> for <em class="part">%s</em>.'),[element.value,p.name]),
                    element,
                    'scorm part answer',
                    'pencil'
                ));
            }
        } else if(m = key.match(/^cmi.interactions.(\d+).staged_answer$/)) {
            var id = parseInt(m[1]);
            var p = this.getPart(id,element);
            var later = this.raw_elements.find(function(e2) {
                return e2.time>element.time && (e2.key=='cmi.interactions.'+id+'.staged_answer' || e2.key=='cmi.interactions.'+id+'.learner_response');
            });
            if(!later && p.type!=='gapfill' && element.value!='undefined') {
                this.add_timeline_item(new TimelineItem(
                    interpolate(_('Entered but did not submit answer <code>%s</code> for <em class="part">%s</em>.'),[element.value,p.name]),
                    element,
                    'scorm part answer',
                    'pencil'
                ));
            }
        } else if(m = key.match(/^cmi.interactions.(\d+).result$/)) {
            var id = parseInt(m[1]);
            var p = this.getPart(id,element);
            var score = parseFloat(element.value);
            this.add_timeline_item(new TimelineItem(
                interpolate(ngettext('Received <strong>%s/%s</strong> mark for <em class="part">%s</em>.','Received <strong>%s/%s</strong> marks for <em class="part">%s</em>.',score),[score,p.marks,p.name]),
                element,
                'scorm part score',
                score_icon(score,p.marks)
            ));
        } else if(m = key.match(/^cmi.objectives.(\d+).score.raw$/)) {
            var id = parseInt(m[1]);
            this.add_timeline_item(new TimelineItem(
                interpolate(_('Total score for <em class="question">Question %s</em> is <strong>%s</strong>.'),[id+1,element.value]),
                element,
                'scorm question score raw',
                ''
            ));
        } else if(key=='cmi.score.raw') {
            this.add_timeline_item(new TimelineItem(
                interpolate(_('Total score for exam is <strong>%s</strong>.'),[element.value]),
                element,
                'scorm exam score raw',
                ''
            ));
        } else if(key=='x.reason ended') {
            this.add_timeline_item(new TimelineItem(
                interpolate(_('The session was ended automatically because: <strong>%s</strong>.'),[element.value]),
                element,
                'scorm reason-ended',
                'saved'
            ));
        }
    },
    add_launch: function(launch) {
        var msg;
        if(launch.user!=null) {
            msg = interpolate(_('Launched in %s mode by %s.'),[launch.mode,launch.user]);
        } else {
            msg = interpolate(_('Launched in %s mode.'),launch.mode);
        }
        this.add_timeline_item(new TimelineItem(
            msg,
            launch,
            'launch',
            'eye-open'
        ))
    },
    add_timeline_item: function(item) {
        this.timeline.push(item);
    },

    listen_for_changes: function(url) {
        var dm = this;
        var ws_scheme = window.location.protocol == "https:" ? "wss" : "ws";
        var socket = this.socket = new RobustWebSocket(ws_scheme + '://' + window.location.host + url);

        socket.onmessage = function(e) {
            var data = JSON.parse(e.data);
            switch(data.type) {
                case 'scorm.new.element':
                    dm.add_element(data.element);
                    break;
            }
        }
    },

    scrollIntoView: function(element) {
        if(element.nodeType!=element.ELEMENT_NODE) {
            element = element.parentElement;
        }
        if(element.classList.contains('item')) {
            element.scrollIntoView();
        }
    }

}

function TimelineItem(message,element,kind,icon) {
    var ti = this;
    this.message = message;
    this.element = element;
    this.time = DateTime.fromISO(element.time);
    this.time_string = this.time.toLocaleString(DateTime.DATETIME_MED_WITH_SECONDS);
    this.kind = kind;
    this.css = {};
    kind.split(' ').forEach(function(cls) {
        ti.css[cls] = true;
    });
    this.css['remarked'] = element.remarked !== undefined;
    this.icon = icon;
}

var scorm_json = document.getElementById('scorm-elements').textContent;
var elements = JSON.parse(scorm_json);

var remarked_json = document.getElementById('remarked-elements').textContent;
var remarked_elements = JSON.parse(remarked_json);

var launches_json = document.getElementById('launches').textContent;
var launches = JSON.parse(launches_json);

var tl = new Timeline(elements, remarked_elements, launches);
tl.listen_for_changes(listener_url);

ko.applyBindings(tl);
document.body.classList.add('loaded');
