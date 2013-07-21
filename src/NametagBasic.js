
////////////////////////////////////////////////////////////////////////////////
// Nametag Basic, Copyright James Robey c2012-2013, jrobey.services@gmail.com
// THIS LIBRARY IS PROVIDED UNDER THE TERMS OF THE LGPL3 (the Lesser General Public License Version 3)
// SEE THE TERMS OF THE LICENSE AT http://www.gnu.org/licenses/lgpl-3.0.txt
////////////////////////////////////////////////////////////////////////////////
   
    // IN SHORT, Nametag is object-oriented html for a new generation of web-authoring collaboration
   
    // LONGER: This is Nametag Basic, and represents the core of the Nametag Runtime.
    // If you want to use extended features developed for TagOS in your own projects
    // like universally unique compiled programs, big lists, lazy lists, windowed UI, 
    // file-systems, encryption/identity, and more visit DOMAlgebra.com where you
    // can learn about the extended versions of the Nametag Runtime.
       
    // NAMETAG, SUMMARY: A unique HTML application framework combining JSON, JQuery, JQuery Templates, etc
    // into re-usable and flexible structures which achieve useful recomposition and iteration over HTML
    // in the programmatic and layout senses; a reusable component architecture to manage HTML application plugins, 
    // mashups, operating-system like environments, and more, in a new vision of what web-apps should be capable of.
    
    // THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    // IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    // FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    // AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    // LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
    // FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
    // DEALINGS IN THE SOFTWARE.
    
////////////////////////////////////////////////////////////////////////////////
// MOTTO: WALKING THE TAO OF THE DOM, WE WRITE THE CODE YOU WONT HAVE TO. CODE BASE STARTS:
////////////////////////////////////////////////////////////////////////////////

    //"Nametag" in the global namespace holds references for various APIs Nametag offers.
    var Nametag = {};

    /* this is a standard in my framework, for expressing manupulations of the global namespace */
    var GLOBAL = this;
    
    /* If the GUI debugger is not installed, this merely duplicates it's features to the console. */
    Nametag.Debugger = {exceptions:[]};
    
    Nametag.Debugger.error = function(msg, e){
        console.log(msg, e);
    };
    
    Nametag.Debugger.comment = function(msg, e){
        console.log("COMMENT:", msg, e);
    };
    
    Nametag.Debugger.warning = function(msg, e){
        console.log("WARNING:", msg, e);
    };

////////////////////////////////////////////////////////////////////////////////
// The lights dim, the audience hushes, and the show goes on, at document "Ready"
// This is listed first in the code to help newcomers perceive structure.
////////////////////////////////////////////////////////////////////////////////

    $(document).ready(function(){
        Nametag.Body = $('body')[0];
        
        var jbody = $(Nametag.Body);
    
        //blank the body - we will unblank last thing, after load!
        jbody.fadeTo(0, 0);
            
        /* if compiled templates have been included (by virtue of the saved output from DumpNametagTemplatesToConsole()
           being included as a .js file) load them into memory. This */
        Nametag.Runtime._loadTemplateDumpsIfAny();
        
        //If SHMLClass is defined make an instance for global use.
        if(GLOBAL.SHMLClass)
            Nametag.SHML = new SHMLClass();
        
        //build a lookup so the _ConvertNametagsToInstances can figure out what lowercase tag names correspond 
        //with case-sensitive script names. NOTE that making this lookup table DOES require we get a list 
        //of script tags and process them (hardly intensive) but other then that, scripts are not processed until 
        //the first time they are instantiated! This means including a large library of (mostly unused) scripts has no real speed penalty.
        if(GLOBAL.CompilerClass){
            Nametag.Compiler = new CompilerClass();
            Nametag.Compiler._BuildTemplateLookups();
            Nametag.Compiler._ProcessSHMLScriptTags();
        }
    
        //fire the global init event, fired before any nodes are instantiated.
        set(Nametag, "__init__", true);
        set(Nametag, "__load__", true);

        //start the script expand cascade by expanding from the body on down, recursively. The magic!
        Nametag.Runtime.ExpandNametags(Nametag.Body);

        //fire the ready (then after) events on Nametag, giving code a chance to react to the application starting, 
        //without having to rely on jquery events (keeping one pattern throughout is a Good Thing)
        //(the 2nd true tells SendInitstages not to send __init__, as the 
        //   only pattern for using it is calling all events, or all events but init (which is called first by itself as above))
        SendInitstages(Nametag, true);
        
        //now that all is loaded, show the body we hid, at the start.
        jbody.delay(1).fadeTo(0, 1);
        
        //finis. Your program is now running, if any.
    });
    
    /* a place to store methods that are applied variously to Nametags as they are made with diff. options  */
    Nametag.Methods = {};
     
////////////////////////////////////////////////////////////////////////////////////
// assemble the Nametag system, which is the Nametag class itself, the Nametag.Runtime to store
// various state, and bookkeeping methods to aid the Nametag class as appropriate.
////////////////////////////////////////////////////////////////////////////////////
    
    var RuntimeClass = function(){
        var self = this;
        
        //////////////////////////////////////////////////
        //////  INTERNAL LISTS AND LOOKUPS USED FOR MANAGING TEMPLATES...
        //////////////////////////////////////////////////
        
        //Templates that are loaded from an outside list, as opposed to being a script tag received in the document at load.
        //they registered as being from a server; but it's still just a string (server/name, * for document, i.e. */some_script_name)
        self.TemplateNodesByServer = {
            //scripts by their id
        };

        //INTENT: this compiles and caches scripts
        self.CompiledTemplateCache = {};
        //INTENT: this compiles and caches the methods associated with scripts
        self.CompiledTemplateOptionsCache = {};
        //INTENT:this stores the text that was evaluated to get the options stored on the script ONLY for purposes of emitting the script DB for the production runtime.
        self.CompiledTemplateOptionsTextCache = {},
        
        //INTENT:attributes derived from script tags that should be checked for hitches like atttributes 
        self.CompiledTemplateAttributeNames = {};
        //INTENT: used ONLY for nametags lookup; holds a lookup of lower case names to uppercase cached script names, to achieve case insensitivity (otherwise lowercase would have to be enforced.)
        self.TemplateLowercaseLookup = {};
        //INTENT: used ONLY for the named tag
        self.TemplateTagType = {};
        //INTENT: register a list of scripts to be applied as traits at reload
        self.ExtendsTemplateLookup = {};
        //INTENT: record what anonymous templates were made for what templates (compiler)
        self.AnonymousTemplatesForTemplate = {};
        
        /* look up table for workflow lifetimes as used in tagos */
        self.WorkflowLifetimes = {};
        
        //if this is false, no saved, compiled, scripts have been loaded from JS.
        self.SavedCompiledTemplateCache = {};
        self.SavedCompiledTemplateOptionsCache = {};
        self.SavedTemplateLowercaseLookup = [];
        self.SavedTemplateTagType = [];
        self.SavedExtendsTemplateLookup = [];
        
        //////////////////////////////////////////////////
        ////// DEFFERRED METHODS AND EVENTS SAVED DURING THE COURSE OF EVALUATION
        //////////////////////////////////////////////////
        
        //all the loading events themselves are deferred
        self.FirstLoadEvents = [];
        
        //methods that need to be fired after a nametag is created
        self.LoadingTagEvents = [];
        self.LoadItemEvents = [];
        self.LoadedItemEvents = [];
        
        self.LoadedTagEvents = [];
        self.SetupTagEvents = [];
        self.ReadyTagEvents = [];
        self.AfterTagEvents = [];
        self.FinallyTagEvents = [];
        self.FinishedTagEvents = [];
        self.PenultimatelyTagEvents = [];
        self.UltimatelyTagEvents = [];
        self.Expanding = false, // an event/flag to let listeners know if a nametag is in the process of being expanded (top-level only) and which one.

        //////////////////////////////////////////////////
        ////// LOOKUP TO KNOW WHAT TAGS ARE HTML (ANYTHING ELSE WILL PROCESSED AS NAMETAGS)
        //////////////////////////////////////////////////
        //thanks go to Dan Swartzendruber for providing this list and unfatigable speculative help throughout!
        self.html_tag_names = {
            a:true,abbr:true,acronym:true,address:true,applet:true,area:true,article:true,aside:true,audio:true,b:true,
            base:true,basefont:true,bdi:true,bdo:true,big:true,blink:true,blockquote:true,body:true,br:true,button:true,
            canvas:true,caption:true,center:true,cite:true,code:true,col:true,colgroup:true,command:true,data:true,
            datalist:true,dd:true,del:true,details:true,dfn:true,dir:true,div:true,dl:true,dt:true,
            em:true,fieldset:true,figcaption:true,figure:true,font:true,footer:true,form:true,frame:true,frameset:true,
            htrue:true,h1:true,h2:true,h3:true,h4:true,h5:true,h6:true,head:true,header:true,hgroup:true,hr:true,html:true,i:true,
            iframe:true,img:true,input:true,ins:true,isindex:true,kbd:true,keygen:true,label:true,legend:true,
            li:true,link:true,map:true,mark:true,marquee:true,menu:true,meta:true,meter:true,nav:true,noframes:true,
            noscript:true,object:true,ol:true,optgroup:true,option:true,output:true,p:true,param:true,pre:true,
            progress:true,q:true,rp:true,rt:true,ruby:true,s:true,samp:true,script:true,section:true,select:true,small:true,
            list:true,span:true,strike:true,strikeout:true,strong:true,style:true,sub:true,summary:true,sup:true,
            table:true,tbody:true,td:true,textarea:true,tfoot:true,th:true,thead:true,time:true,title:true,tr:true,track:true,
            tt:true,u:true,ul:true,video:true,wbr:true,xmp:true
        },
        
        self.html_tag_names['var'] = true;
        
        //dynamic css loaded by key, used in removing them
        self.styles = {};
        
        //////////////////////////////////////////////////
        ////// STANDALONE/MISC STUFF
        //////////////////////////////////////////////////
        
        /* stuff for double click */
        self.cancelDoubleClickFlag = false;
        
        //do we use jshint to tell us about mistakes? save cycles with off
        self.debug = true;
        
        //do we save text related to compilation of scripts in memory that makes it easier to dump them, later?
        self.enableTemplateCompilation = true;
        
        //how close do two clicks have to be to be a double click? higher values introduce greater UI delay
        self.doubleClickDelay = 160;
        
        /* this will hold a table of __uuid__ to name, used in debugging */
        self.ScriptReverseAliases = {};
        
        /* any hitches set on these attributes will be inited at the start of the nametag automatically.*/
        self.attributes_to_autohitch = ['width', 'height', 'top', 'left', 'opacity'];
        
        /* how long the mouse must be held down before drag is interpretted. *2 is hoverselectable time */
        self.dragdelay = 400;   
        
        /* any class-name to method associations created here will have that method applied to any node with that class
           once, when a top level nametag is reloaded. By utilizing a per-element flag, we will NOT apply a trait more than 
           once, even if we process the thing more than once - we dont remove the class as we do with nametag because, as in 
           the instance of button, we want the class AND the behavior. I introduce CSS Traits! */
        self.CSSTraits = {};
        
        /* these are public apis wrapping the creation of an object+running some method on it.
           This form of encapsulation allows for normalized Nametag.Runtime.foo() calls while
           still creating a new class each call, something critically required for correct error handling */

        /* a global to access items from the query string. note we strip the leading '?' from the query string, if any */
        self.QueryString = parseQueryString(window.location.search.substring(1));
    
        return self;
    };
    
    /* YOU may add as many traits under the same name as you wish, just like methods chain in nametags */
    RuntimeClass.prototype.addCSSTrait = function(css_class_name, method){
        var self = this;
        
        var dict_to_merge = {};
        dict_to_merge[css_class_name] = method;
        
        if(!self.CSSTraits[css_class_name])
            self.CSSTraits[css_class_name] = method
        else
            NametagClass.prototype.mergespace(dict_to_merge, self.CSSTraits, true); //final true forces chaining instead of using the "super" approach.
    }
    
    /* remove a css trait from processing in the future */
    RuntimeClass.prototype.removeCSSTrait = function(css_class_name){
        var self = this;
        
        /* but you can only delete the entire set of methods for a css trait */
        delete self.CSSTraits[css_class_name];
    }
    
    //yep, this is really it, the event loop of the nametag system. This function always operates on live DOM, emitting
    //inner scripts for use with instances as it finds them. When scripts create yet more class-nametag nodes
    //and this method is recursively called on their contents, a tree of nametag instances are detected and expanded
    //according to the Laws Of Nametag.

    //FYI: Because this operates on "live" DOM nodes (in the page) jquery, and not XML, routines are needed for traversal.
    //XML routines are used interior, when processing dom'd script tag content, etc.

    //NOTE: Order is VERY important here. This parituclar way visits nodes and makes things work the right way.
    //alter with extreme care! 
    RuntimeClass.prototype.ExpandNametags = function(target){ 
        /* we must use a try/except loop here, or we will be unable to continue when a nametag has errors */
        try{
            /* try/catching errors at this level allows us to continue when errors in an app occur. */
        
            //mark that a loading cycle (a recursive call starting from some initial call) is beginning.
            if(!Nametag.Runtime.Expanding)
                Nametag.Runtime.Expanding = target;

            //INTENT: a non-recurisve search algorithm for all top-most nametag nodes, which, with their options,
            //will be instantiated as needed. Since inner scripts are now handled in scripttags (as option inner_script) we'll
            //not handle them here, when expanding nametags, any longer. We treat anonymous templates just like real templates.
            //This reflects the deeper reality of anonymous nodes in the html body as  being "parsed-in" BEFORE being processed/output
            //just like real templates. The previous method of just printing an entire DOM via a single jq template was 
            //inefficient and error prone, since things like var replacement in image tags wont work right (not
            //to mention that dom being "printed twice", once on browser ready and again as an anonymous scripts were 
            //detetected via this loop, if we did allow it.
            var nametags_to_expand = [];

            //start off our processing with all of the child nodes of the target node to process.

            var all_items = [target[0] || target]; //the list of all outstanding items to process

            var item; //the current item being processed
            while(item = all_items.shift()){
                //if we find one
                if(hasClass(item, 'nametag')){    
                    //we push here.. but pop below - so it's evaled in the order we found them.
                    nametags_to_expand.push([item, Nametag.Runtime._extractCodeblock(item) || ""]);

                    //we've processed the nametag - empty it - remove the nametag class, add it to the nametags to be 
                    $(item).empty().removeClass('nametag').addClass('NametagInstance');
                }                    

                //add all element children to be checked for nametags to make
                var children = $.makeArray(item.childNodes);
                for(var i = 0, node ; (node = children[i]) ; i ++)
                    if(node.nodeType == 1)
                        all_items.push(node);
            }

            //We have the nodes to make - now we make them:
            //If a new nametag as a result contains more nametags, this method is called recursively to expand those
            //and only on the top node as saved by Runtime.Expanding == item is true is the  
            //node top-level -- all loads will occur. All methods added during these recursions are all handled at the end, as god intended.
            
            //it IS important that we pop and not shift - this allows for child nametags to experience their
            //construct events before their parents do. of course, if we want to do something AFTER, that's 
            //the whole point of initstages, so this setup is not constrictive, but awesome.
            while((item = nametags_to_expand.pop())){
                try{
                    new NametagClass(item[0], item[1]);
                }catch(e){
                    var err_msg = String(e);
                    var final_err_msg = "Construct error ------------\n\n    "+err_msg;
                    
                    if(!err_msg.startswith("SYNTAX ERROR: "))
                        final_err_msg += "\n\nContext was -------------------------------\n    " + item[1];
                        
                    if(Nametag.Debugger.exceptions.length){
                        for(var i = 0; i < Nametag.Debugger.exceptions.length ; i ++)
                            final_err_msg += Nametag.Debugger.exceptions[i] + "\n";
                        Nametag.Debugger.exceptions = [];
                    }
                        
                    Nametag.Debugger.error(final_err_msg);
                    
                    /* this is just handy.. letting the console highlight the div with the error visually too */
                    console.log("Tag associated with last error is: ", item[0]);
                    
                }
            }
            
            //for each nametag we found (and parsed, for its inner scripts, etc), process it
            //this ensures that each "layer" (as the dom gets deeper) of nametags gets made depth-first.
            if(target == Nametag.Runtime.Expanding){
                //run the accumulated initialization stages, interleaved for all items then list in each stage. order is important!
                var debug_state = [];
                for(;;){
                    try{
                        //SUMMARY: This will look for deferred methods to run, and whenever it finds any,
                        //runs and jumps back to the beginning again such that all methods of a given initstage are 
                        //run before any later ones, as is desired logically. Ending condition is getting to the 
                        //end, where a break awaits. This is actually quite important, and this is fast.

                        //First we look at any loads (which will probably make more of the deferreds handled next!)
                        //NOTE: we shift reloads off the top of the stack, from top to bottom
                        if(Nametag.Runtime.FirstLoadEvents.length){
                            var nametag = Nametag.Runtime.FirstLoadEvents.shift();
                            debug_state[0] = 'FirstLoadEvents'; debug_state[1] = nametag.script || nametag.inner_script;
                            nametag.reload();
                        }
                        
                        //__init__ is not fired as a part of this loop since it is NOT deferred liek the rest of these are.
                        
                        /* load for items goes first */
                        else if(Nametag.Runtime.LoadItemEvents.length){
                            var state = Nametag.Runtime.LoadItemEvents.pop();
                            debug_state[0] = 'LoadItemEvents'; debug_state[1] = state[0].__loaditem__ || state[0];
                            state[0].fire('__loaditem__', state[1]);
                        }

                        //the __load__ event happens everytime a script or list is reloaded, incl. the first time
                        //NOTE: but we pop off of the Deferred events, from bottom to top!
                        else if(Nametag.Runtime.LoadingTagEvents.length){
                            var nametag = Nametag.Runtime.LoadingTagEvents.pop();
                            debug_state[0] = 'LoadingTagEvents'; debug_state[1] = nametag.__load__ || nametag;
                            nametag.fire('__load__');
                        }
                        
                        else if(Nametag.Runtime.LoadedItemEvents.length){
                            var state = Nametag.Runtime.LoadedItemEvents.pop();
                            debug_state[0] = 'LoadedItemEvents'; debug_state[1] = state[0].__loadeditem__ || state[0];
                            state[0].fire('__loadeditem__', state[1]);
                        }

                        //the __loaded__ event happens everytime a script or list is reloaded, incl. the first time
                        //NOTE: but we pop off of the Deferred events, from bottom to top!
                        else if(Nametag.Runtime.LoadedTagEvents.length){
                            var nametag = Nametag.Runtime.LoadedTagEvents.pop();
                            debug_state[0] = 'LoadedTagEvents'; debug_state[1] = nametag.__loaded__ || nametag;
                            nametag.fire('__loaded__');
                        }

                        //the __setup__ event is only run on nametag *instances*, never scripts made by a nametag (aka list items) because only instances can be deferred by autoload:false and thus need a prepare
                        else if(Nametag.Runtime.SetupTagEvents.length){
                            var nametag = Nametag.Runtime.SetupTagEvents.pop();
                            debug_state[0] = 'SetupTagEvents'; debug_state[1] = nametag.__setup__ || nametag;
                            nametag.fire('__setup__');
                        }

                        //the __ready__ event runs only on the first load of a script or list, indicating that all lists have loaded for the first time
                        else if(Nametag.Runtime.ReadyTagEvents.length){
                            var nametag = Nametag.Runtime.ReadyTagEvents.pop();
                            debug_state[0] = 'ReadyTagEvents'; debug_state[1] = nametag.__ready__ || nametag;
                            nametag.fire('__ready__');
                        }

                        //after is run on every load, like __load__, __loaded__, firing after them.
                        else if(Nametag.Runtime.AfterTagEvents.length){
                            var nametag = Nametag.Runtime.AfterTagEvents.pop();
                            debug_state[0] = 'AfterTagEvents'; debug_state[1] = nametag.__after__ || nametag;
                            nametag.fire('__after__');
                        }

                        //__finally__ is run on every load, like __loaded__, but after ready
                        else if(Nametag.Runtime.FinallyTagEvents.length){
                            var nametag = Nametag.Runtime.FinallyTagEvents.pop();
                            debug_state[0] = 'FinallyTagEvents'; debug_state[1] = nametag.__finally__ || nametag;
                            nametag.fire('__finally__');
                        }

                        //__finished__ is run on every load, like __init__, top to bottom, but after everything else.
                        else if(Nametag.Runtime.FinishedTagEvents.length){
                            var nametag = Nametag.Runtime.FinishedTagEvents.shift();
                            debug_state[0] = 'FinishedTagEvents'; debug_state[1] = nametag.__finished__ || nametag;
                            nametag.fire('__finished__');
                        }

                        //__penultimately__ just comes before __ultimately__. See ultimately for discussion of behavior. This is only
                        //used by the event logic, to be able to have a phase it can set values that the user (programmer) can schedule
                        //things after (in other words, to be able to have __ultimately__ work after the system's had it's __ultimately__.
                        //it useful.)
                        else if(Nametag.Runtime.PenultimatelyTagEvents.length){
                            var nametag = Nametag.Runtime.PenultimatelyTagEvents.pop();
                            debug_state[0] = 'PenultimatelyTagEvents'; debug_state[1] = nametag.__penultimately__ || nametag;

                            setTimeout(function(nametag){
                                return function(){
                                    nametag.fire('__penultimately__');
                                };
                            }(nametag));
                        }

                        //__ultimately__ is different in one major way - all such methods occured after the entire render tree has been finished,
                        //providing for an event to happen after the screen has cleared up, or after a delay, etc.
                        else if(Nametag.Runtime.UltimatelyTagEvents.length){
                            var nametag = Nametag.Runtime.UltimatelyTagEvents.pop();
                            debug_state[0] = 'UltimatelyTagEvents'; debug_state[1] = nametag.__ultimately__ || nametag;

                            setTimeout(function(nametag){
                                return function(){
                                    nametag.fire('__ultimately__');
                                };
                            }(nametag));
                        }

                        //OUR ENDING CONDITION: if we make it here, then there were no more outstanding
                        //deferreds to do, and so we should break.
                        else
                            break;
                    }
                    
                    catch(err){     
                        if(Nametag.Debugger.exceptions.length){
                            var final_err_msg = "";
                            for(var i = 0; i < Nametag.Debugger.exceptions.length ; i ++)
                                final_err_msg += Nametag.Debugger.exceptions[i] + "\n";
                            Nametag.Debugger.error(final_err_msg);
                            Nametag.Debugger.exceptions = [];
                        }
                        
                        else
                            Nametag.Debugger.error("Non method error:\n\n"+String(err));
                    }
                }
                
                /* make all inputs grab and release focus on the active window in our Nametag.GUI focus system. */
                
                /* we dont process this as a CSS Trait because it has some special needs, such as including the target, 
                   rather than merely finding nodes below it.  It's different in that it's not a new feature but something
                   every input needs to work with focus and so this code actually has application-wide conseqeuences.  */
                if(Nametag.GUI.focus){
                    $(target).find("input[type!='button'], textarea, select")
                        .blur(Nametag.GUI.focus.blurInputMethod)
                        .focus(Nametag.GUI.focus.focusInputMethod);
                
                    if((target.tagName == 'input' && target.type != 'button') || target.tagName == 'textarea' || target.tagName == 'select')
                        $(target)
                            .blur(Nametag.GUI.focus.blurInputMethod)
                            .focus(Nametag.GUI.focus.focusInputMethod);
                }

                /* THIS processes CSS Traits.. that is, if we search for and process all the nodes
                   we find with the class given, and we place a flag on it to prevent double processing. 
                   doing it here represents an ideally efficient method of ensuring every node with the 
                   given class has the method applied just once, in all situations.  */
                for(var class_name in Nametag.Runtime.CSSTraits)
                    $(target).find(class_name).each(function(){
                        var applied_trait_flag = '_CSSTrait_'+class_name;
                        if(!this[applied_trait_flag]){
                            Nametag.Runtime.CSSTraits[class_name].call(this, this);
                            this[applied_trait_flag] = true;
                        }
                    });
                
                Nametag.Runtime.Expanding = false;
            }    
        }
        
        
        catch(err){
            if(Nametag.Debugger.exceptions.length){
                var final_err_msg = "";
                for(var i = 0; i < Nametag.Debugger.exceptions.length ; i ++)
                    final_err_msg += Nametag.Debugger.exceptions[i] + "\n";
                Nametag.Debugger.error(final_err_msg);
                Nametag.Debugger.exceptions = [];
            }
            
            else
                Nametag.Debugger.error("Non method error:\n\n"+String(err));

            Nametag.Runtime.Expanding = false;
            Nametag.Runtime.isCompiling = false;
        }
    };
    
    
    /* simply return a block of text with line numbers */
    RuntimeClass.prototype.addLineNumbers = function(buf){
        var text_block_with_line_numbers = "";
        var text_block_split_up = String(buf).split("\n");
        for(var i = 0; i < text_block_split_up.length ; i ++)
            text_block_with_line_numbers += (i+1)+": "+text_block_split_up[i] + "\n";
        return text_block_with_line_numbers;
    };
    
    //INTENT: given a script_name, check both the document, and the ImportedTemplates store, for a node
    //(script tag) that contains the info needed to make the script. That info is parsed and stored in Nametag.Runtime;
    //CompiledTemplateCache, CompiledTemplateOptionsCache which together will
    //be inspected and used when building a script of that given script_name. Tada! (note so callled "inner scripts" DON'T get
    //processed here, but up to a point do use the same algorithms you'll see below) 
    RuntimeClass.prototype.TemplateCache = function(script_name){
        //INTENT: determine full name to use. if no server given, store under "*/"+script_name - the default server
        if(script_name.indexOf("/") == -1)
            script_name = "*/"+script_name;

        if(Nametag.Runtime.CompiledTemplateCache[script_name] !== undefined)
            return Nametag.Runtime.CompiledTemplateCache[script_name];

        //if CompiledTemplateCache (and CompiledTemplateOptionsCache) have been defined -- usually by way of 
        //a script including the output of DumpNametagTemplatesToConsole() -- use it to populate our scripts
        //and, presumably, spare us the pain of parsing it ourselves, later.
        if(Nametag.Runtime.SavedCompiledTemplateCache && !Nametag.Runtime.CompiledTemplateCache[script_name] && Nametag.Runtime.SavedCompiledTemplateCache[script_name]){
            //eval the jquery tmpl method
            var jq_tmpl_method;
            
            try{
                eval("var jq_tmpl_method = "+Base64.decode(Nametag.Runtime.SavedCompiledTemplateCache[script_name]));
            }catch(err){
                err.message = "\nIn the context of the script: "+script_name+":\n\n"+err.message;
                throw err;
            }
            
            Nametag.Runtime.CompiledTemplateCache[script_name] = jq_tmpl_method;
            Nametag.Runtime.CompiledTemplateOptionsCache[script_name] = Base64.decode(Nametag.Runtime.SavedCompiledTemplateOptionsCache[script_name]);
            return Nametag.Runtime.CompiledTemplateCache[script_name];
        }
        
        else if(Nametag.Compiler){
            //other wise we didn't have it in our cache, or a predefined cache - build it.
            Nametag.Compiler.ImportIntoTemplateCache(script_name);

            //hand back the xml for the script. The methods will be applied as the process needs it to be, indexed by the same name
            return Nametag.Runtime.CompiledTemplateCache[script_name];
        }
        
        else
            throw "Nametag requires the Nametag.Compiler system be present, as running the script "+script_name+" would require";
    };
    
    /* .............................. */
    /* THIS COMES FROM DEVELOPMENT WITH THE COMPILER; THIS IS THE RUNTIME PORTION: */
    /* .............................. */

    /* INTENT: return a dict containing everything I need to start an app 
       whether .app or .compiled. */
    
    RuntimeClass.prototype.info = function(path){
        var data = {};

        path = fat.normalizePath(path);
        var pointer = fat.reference(path);

        if(!pointer){
            console.log("info could not find", path);
            return false;
        }

        /* if it's a .compiled file, try to read it in */
        if(path.endswith(".compiled")){
            
            try{
                var file_contents = fat.read(path, false);
            }catch(err){
                throw path+" doesn't exist";
            }
            
            try{
                /* parse json from a jszip file */
                data = JSON.parse(file_contents);                   
            }
            
            catch(err){
                try{
                    /* parse json from a jszip file */
                    data = JSON.parse(
                        new JSZip(
                            file_contents, {base64:true}
                        ).file("compiled.app").data
                    );
                }
                
                catch(err){
                    try{
                        /* parse json from a jszip file */
                        data = JSON.parse(Base64.decode(file_contents));
                    }
                    
                    catch(err){
                        throw path+" is not readable as .compiled app.";
                    }
                }
            }
        }

        else if(path.endswith(".app")){
            data.appid = pointer.__uuid__;
        }

        else
            throw "The path "+path+" was neither a .compiled or .app file";

        /* provide defaults for both .app's and .compiled's */
        if(!data.apppath)       data.apppath = path;
        if(!data.icon)          data.icon = data.icon || pointer.__icon__ || '/common/Images/application/appicon.png';
        if(!data.title)         data.title = justFileName(pointer.__path__);
        if(!data.description)   data.description = data.title;

        data.using = data.appid;

        return data;
    };
    
    /* THESE ROUTINES HANDLE ADDING CSS SENSIBLY (AND WITH TEXT PROCESSING) */

    /* add a set of css declarations under a key which will ensure uniqueness - that is, 
       if a css sheet exists under that key, it is first removed. */
    RuntimeClass.prototype._addCSSByKey = function(csstext, key){
        var self = this;
        /* create a new style tag */
        var sheet = document.createElement('style');

        /* use the style_id to make sure we keep one css sheet on the body per app (not ever-escalating numbers) */
        if(Nametag.Runtime.styles[key])
            $(Nametag.Runtime.styles[key]).remove();

        /* update bookeeping for next time we replace it. */
        Nametag.Runtime.styles[key] = sheet;

        /* and finally fill in the contents of the new style tag, committing it to the body */
        sheet.innerHTML = csstext;
        document.body.appendChild(sheet);

        /* return the csstext (with selfs replaced if appropriate) */
        return csstext;
    };
    
    /* remove a css sheet, given the key it was stored under */
    RuntimeClass.prototype._removeCSSByKey = function(key){
        /* remove the sheet if it exists */
        if(Nametag.Runtime.styles[key]){
            $(Nametag.Runtime.styles[key]).remove();
            delete Nametag.Runtime.styles[key];
        }
    };
    
    //INTENT: load certain saved data attributes as available from compiled templates 
    //loaded via javascript exports (made from the function, "", here)
    RuntimeClass.prototype._loadTemplateDumpsIfAny = function(){
        if(this.SavedTemplateLowercaseLookup.length)
            for(var i = 0; i < this.SavedTemplateLowercaseLookup.length ; i ++)
                copy(JSON.parse(Base64.decode(this.SavedTemplateLowercaseLookup[i])), this.TemplateLowercaseLookup);

        //if one or more SavedTemplateTagType's are available, merge them with our master version.
        if(this.SavedTemplateTagType.length)
            for(var i = 0; i < this.SavedTemplateTagType.length ; i ++)
                copy(JSON.parse(Base64.decode(this.SavedTemplateTagType[i])), this.TemplateTagType);

        //if one or more SavedExtendsTemplateLookup's are available, merge them with our master version
        if(this.SavedExtendsTemplateLookup.length)
            for(var i = 0; i < this.SavedExtendsTemplateLookup.length ; i ++)
                copy(JSON.parse(Base64.decode(this.SavedExtendsTemplateLookup[i])), this.ExtendsTemplateLookup);
    }
    
    /* this will identify, extract, and return the codeblock as present on a dom node
       (that is, it will erase and return the codeblock, preparing the item for first run) */
    RuntimeClass.prototype._extractCodeblock = function(item){
        var codeblock = "";

        //accumulate text - for options - and nodes - for support of the anonymous script interior to the tag
        var firsttextblock = true;

        /* this gets rid of nodes - after the loop to accumuate text (and add comments
           for deletion) */
        var nodesToRemove = [];

        //get any text of the nametag to use as js options
        for(var i = 0, node; (node = item.childNodes[i]) ; i ++){

            /* if text both accumulate it and add it to be deleted afterward */
            if(node.nodeType == 3){
                codeblock += node.nodeValue;
                nodesToRemove.push(node);
            }

            /* if it's a comment also add that to be deleted */
            else if(node.nodeType == 8)
                nodesToRemove.push(node);
        }

        /* this gets rid of comments - they can mess up having a single outputted node, a requirement for lists. */
        var node;
        while((node = nodesToRemove.shift()))
            item.removeChild(node);
            
        return codeblock;
    };
    
    RuntimeClass.prototype.makeElementNavigable = function(self){
        //see use of _resolveParentReferences in nametag.js, in NametagClass init.
        var references = NametagClass.prototype._resolveParentReferences.call(self);
        self.parentNametag = self.parent = references[0];
        self.scriptroot = self.root = references[1]
        self.itemroot = references[2];
        
        var elementMethods = NametagClass.prototype;
        
        self.jsibling = elementMethods.jsibling;
        self.jchild = elementMethods.jchild;
        self.jnamed = elementMethods.jnamed;
        
        self.child = elementMethods.child;
        self.named = elementMethods.named;
        self.sibling = elementMethods.sibling;
        
        self.hasChild = elementMethods.hasChild;
        self.hasNamed = elementMethods.hasNamed;
        self.hasSibling = elementMethods.hasSibling;
        
        self.lookup = elementMethods.lookup;
        self.lookupobject = self.lo = elementMethods.lookupobject;
        self.lookupset = elementMethods.lookupset;
        self.lookuplisten = elementMethods.lookuplisten;
    }
    
    /* CREATE THE GLOBAL RUNTIME CLASS IMMEDIATELY, NOT WAITING FOR 
       DOCUMENT READY. THIS ONLY LETS (FOR NOW) CSS TRAITS BE ADDED 
       BEFORE THE DOCUMENT IS READY (i.e. in script tags)*/
    
    /* this will contain both attributes necessary to global state AND reference to global APIS for managing the runtime */
    Nametag.Runtime = new RuntimeClass();
    
    ////////////////////////////////////////////////////////////////////////////////
    // The "Nametag" class is associated with every node in the DOM with class "nametag"
    // and is the basic unit of organization in a nametag program. Other attributes are 
    // copied onto the element, for convenience.
    // Note that recursion is managed by the NametagClass.prototype.ExpandNametags method, 
    // called during the process of initializing a nametag (_initNametag), to let the nametags defined
    // in a script yet again produce more nametags, until the DOM is initialized. 
    ////////////////////////////////////////////////////////////////////////////////
    
    var NametagClass = function(element, text_of_tag){
        //if they give no element, presume they just want access to methods like CreateNametag.
        if(element === undefined)
            return this;    
        
        /* otherwise copy all from ourselves, the new instance, onto the element. by this 
           means a nametag gets it API */
        for(var key in this)
            element[key] = this[key];
            
        /* for use in this initalizer method  */
        var jelement = $(element);

        //this is a flag just to indicate this element is a nametag, which can be useful i.e if(element.nametag)..
        element.nametag = element;

        //this is only set when methods with a 'super' are running
        element.__super__ = false;

        //dealing with basic nametag parameters
        element.initialized = false;         //a boolean indicating if this nametag has be loaded for the first time (which happens after init, or when reload is first called when autoinit=false)
        element.isReset = true;              //a flag letting us avoid resetting unecessarily on reload

        element.script = false;              //this will tell the instance which nametag script to use.
        element.inner_script = false;        //the name of any inner_script associated with this nametag, as inserted by a processsor in script tags.
        element.use_inner_script = true;     //if this is true, inner scripts will be used as defined. If false, the variable "inner_script" will still hold a script name, but it wont be painted (in expectation of the user doing it manually)
        element.traits = [];                 //either a list or comma sep names of scripts to apply atop of this one.
        element.extend = "";                 //this script can extend another -- as if this script was called as trait on the script given here -- to extend it's functionality.
        element.server = "*";                //the server will change which script is loaded, i.e. scripts with the same name but different servers are stored seperately.
        element.autoload = true;             //will element list load when created?
        element.autoreload = true;           //will reload when the list of obj/attr you pass for fires, but doesn't affect first load.

        //dealing with references to nametag children WITH A NAME they create on us to facilitate traversal.
        element.children = {};

        //dealing with lists and lists w/ url
        element.list = false;                //the url, data structure, or method returning either to be used when replicating
        element.filelist = false;            //these help us make lists that sync to files, folders
        element.folderlist = false;          //these help us make lists that sync to files, folders
        element.filefolderlist = false;      //these help us make lists that sync to files, folders
        element.filetype = false;            //these help us make lists that sync to files, folders
        element.evaluated_list = [];         //the actual data structure the list resolved to, whether list was url or method - also where to look for a "gathered" list.
        element.query = {};                  //when a remote json list is used, what query to post to the server
        element.__filter__ = false;          //if a function that controls presence of nodes from the list of a script where if passed to this, should return true.

        //dealing with seelction and selectables and changing items
        element.selectable = false;          // both a flag applying selection methods, and the comma-sep, or array, of effects for hover, selected (css classes)
        element.selectfirst = false;         // whether to select the first element on reload or not
        element.selectedItems = [];          // a list of references to currently selected items.
        element.selection = false;           // a reference to the currently selected item if only 1 is selected.
        element.multiselectable = true;      // a boolean indicating if multiselectableion is allowed.        
        element.linearselectable = true;     // can the list be shift-clicked or key up/down? (i.e. assume some linear layout to make that make sense?)
        element.keyselectable = false;       // only for use when writing apps for tagos use. will allow __uparrow__ and __downarrow__ to go to the last selected list that had this set to true. 
            element.keyremovable = false;        // if this is true, backspace will remove selected items
            element.keyremovableconfirm = false; // if this is true, alt must be pressed with backspace to remove selected items
            element.verticalarrowkeys = true;    // should the left-right keys be used for selection (default no)?
            element.horizontalarrowkeys = false; // should the left-right keys be used for selection (default no)?
            element.reversearrowkeys = false;    // make up arrow go down/right arrow go left vice versa - useful for rotated environments
            element.autofocus = false;          // this can actually be used on any type of nametag, and serves to give that nametag focus when it is finished (i.e. on __finished__)
        element.mouseselectable = true;      // whether or not a selectable list will process mouse events
        element.stickyselected = false;      // whether we want the selection (not selected) to survive reload via a simple (data must be unique for all!) match method to find the previous node in the new list.
        element.reselectable = false;         // whether we can send selection to an item over and over, or only if it's not already selected.
        element.unselectable = true;         // is it possible to unselect an item once selected
        element.textselectable = false;      // whether the class 'unselectable' is applied to a list whne it is made  
        element.hoverselectable = false;     // if true then a child can be selected by a hover while dragging
        element.dragselectable = false;      // if true then a child can be selected by holding down alt-key on mouseover
        element.toggleselect = false;        // whether items will toggle when you click them, as opposed to staying selected
        element.unsetselection = true;       // if this is false, unselection events will not occur when setSelection (only!) is called. this is useful when you know you will go from one selection to the next in a reload-pattern and so resetting is extra work, but still want unselection when the selection is zero or more than one. this is an optimization.
        element.autoscrollable = false;      // if this is true, then selection will cause the item to be centered in the view vertically, if it's not on the screen (otherwise nothing happens)
        element.loopscrollable = true;       // if we are autoscrollable, and this is true then the arrow keys loop around the first and last items.
                                                
        //dealing with the drag and drop system
        element.drag = false;                //a comma-sep 2 index arr. of type and optional script to create for drag item..           
        element.dragtemplate = false;        //a template name to invoke with the items being dragged in data.items instead of just copying the dom of the drug items, as normal.
        element.drop = false;                //this will indicate what type can drop on us
        element.droponchild = false;         //this is a flag indicating if the element, or also all the elements itesm, should be drop. If true, __drop__ will also get the child dropped on (or false for dropped last)
        element.droponothers = true;         //whether or not a drag op. from this nametag can drop on other containers.
        element.droponself = false;          //can we drop on ourselves?
        element.selectondrag = true;         //flag to indicate if dragging an object automatically selects it, too.
        element.droponcontainer = false;     //ONLY ON if 'droponchild == true'! If this is true, BOTH the container and the children can be droppable Normally it's either the container (normal) or the children (droponchild true). If dropped on the container, the child parameter will be equal to element */
        element.dragdataonly = false;        //ONLY if true, do we refrain from providing the actual items during a drop op; we provide copies of each item's data instead. this lets drag/drop survive the destroy of the source while maintaining good memory managment.
        element.onlyaltselectable = false;   //Alt MUST be pressed to select/drag elements. this hack lets lists host complex event handlers that otherwise dont chain (like drag/drop handlers and input fields conflicting). By requiring alt, fields work normally but list operations are still possible.

        //misc; filtering, headers, local storgage
        element.autosized = true;            //a flag instructing the nametag to listen to change events, or not. Only works on structural nametags, not items.
        element.autoanimated = false;        //do we, when one of our top/left/width/height changes, merely set, or animate to, the given size?
        element._autohitches = [];           //a store kept by element.scanAttributes that lets us easily run hitches on ourselves that need initialization on reload, instead of waiting for the target to emit an event, efficienty.
        element._hitchestext = {};           //text of any %% hitches detected, so we can reassign and reprocess them if needed.
        element._traitsFromOptions = [];     //setup any attributes on ourselves we get from traits.
        
        element.focusring = true;           //should the focus system draw an outline to indicate it's a target of events? default true.
        
        element.lo = element.lookupobject; //short cut to lookupobject for hitches
        
        //returns a triplet of references found by looking upward. central to the model.
        var references = element._resolveParentReferences();
        
        //The 'parentNametag' attr works by finding the first tag with a .nametag attribute 
        //above this tag (one of the reasons the attribute is there)
        //we also alias it with parent. there is no .parent in the W3C dom (it's .parentNode) so this is legit.
        element.parentNametag = element.parent = references[0];
        
        //The scriptroot is analogous to a top of some nametag defintion/instance. when you make a 
        //nametag, it must have a name. anonymous views inside it have have no script attribute
        //so if we go up to the first tag with a script attribute we can skip upwards effectively.
        //we also alias it with root. it comes up a lot.
        element.scriptroot = element.root = references[1]
        
        //The 'itemroot' works by finding the first node above it with an .itemlist attribute
        //and lets us skip to the 'top' of an item made by a nametag list
        element.itemroot = references[2];
        
        //if this nametag has a name - and if we have a parent - place a reference to this node 
        //on the parent's children attr. Therefore we can say self.children.foo to get a nametag named foo
        //inside of us. This renders the use of the child() function unneeded when dealing with the nametag 
        //"view tree".
        var elem_name = element.getAttribute('name');
        if(elem_name && element.parent)
            element.parent.children[elem_name] = element;
           
        //we bring in the attributes from the tag as options, but they will NOT overwrite anything in a codeblock including traits.
        //this is because other floatsam on tags needed for html could interfere with proper function.
        var attr_dict = {};
        for(var i = 0, attr; (attr = element.attributes[i]) ; i ++)
            attr_dict[attr.nodeName] = attr.nodeValue;
        elementcopy(element.scanAttributes(attr_dict, element, undefined, undefined, true), element);

        //if they give a script name, change it to the fully qualified script name, using whatever server they set.
        if(element.script){
            element.script_name = element.script;
            element.script = (element.server || "*")+"/"+element.script;
        }

        //if we dont have a .data attribute (for stuff passed into the nametag) make one
        if(element.data)
            elementcopy(element.data, element);

        //INTENT: If a script is given and it's not a list type script, apply all the values from the 
        //        CompiledTemplateOptionsCache to element, as they will be options we want applied. Note
        //        that when it's a list type script this operation doesn't apply -- we DONT want the values
        //        from a list *element* mapped onto the *list itself* (aka the nametag where the items will be painted)
        if(element.script){ 
            //if the script hasn't been cached, do so!
            if(!Nametag.Runtime.CompiledTemplateCache[element.script])
                Nametag.Runtime.TemplateCache(element.script);

            //apply the defaults for the script on both self and the element (the "this" in the code)
            var tmpl_options = Nametag.Runtime.CompiledTemplateOptionsCache[element.script].call(element, element);

            //if we have options...
            if(tmpl_options){
                //if we have defaults map that on self and element
                if(tmpl_options.__defaults__)
                    elementcopy(tmpl_options.__defaults__, tmpl_options);

                //map all options onto self and element
                element.mergespace(tmpl_options);

                //this processes all strings through element.scanAttributes, for %{} and %%{} types
                var strings_to_process = {};
                for(var key in tmpl_options)
                    if(gettype(tmpl_options[key]) == 'string' || key.slice(0,1) == "$")
                        strings_to_process[key] = tmpl_options[key];
                copy(element.scanAttributes(strings_to_process, element), element);
            }
            
            tmpl_options = null;
        }
        
        //if there is codeblock, treat it like a text-dict-to-be-evald that merges with the options passed in 
        //from the actual options.
        //Turn options['codeblock'] into a dict (i.e. "x" -> "{x}", with any trailing comma of x removed)
        var codeblock = text_of_tag.trim();
        if(codeblock.slice(-1) == ",")
            codeblock = codeblock.slice(0, codeblock.length-1);
        codeblock = "{" + codeblock + "}";

        //check the code for errors -- sourcetext in this case will already be a dict!
        if(Nametag.Runtime.debug){
            var result = checkDictionaryForErrors(codeblock);
            if(result)
                throw "SYNTAX ERROR: "+result + '\n\nCode is:\n\n' + Nametag.Runtime.addLineNumbers(codeblock);
        }
        
        var codeblock_function;

        //note we make a function from text here because we'll want to reevaluate this every reload, but want to only parse it once!
        try{
            eval("codeblock_function = function(self){return "+codeblock+';};');
        }catch(err){
            err.message = "\nIn the context of the code:\n\n"+codeblock+"\n\n...\n\n"+err.message;
            throw err;
        }

        //actually run it, getting our config parameters for the first time, and merge that into our options.
        //(the source text will be used to establish key/values on the same dict it is in, in other words.)
        var codeblock_dict = codeblock_function.call(element, element);
        codeblock_function = null;
        element.mergespace(codeblock_dict);

        //this processes all strings through element.scanAttributes, for %{} and %%{} types
        var strings_to_process = {};
        for(var key in codeblock_dict)
            if(gettype(codeblock_dict[key]) == 'string' || key.slice(0,1) == "$")
                strings_to_process[key] = codeblock_dict[key];
        copy(element.scanAttributes(strings_to_process, element), element);
        
        codeblock_dict = null;

        //finally, we need to overwrite data, which we made available to the
        //codeblocks running above by setting early, and we wish to force
        //overwrite of now.
        if(element.data)
            elementcopy(element.data, element);
            
        //constructing is called after the namespaces have been figured out, but before options 
        //have been considered. the next state, "constructed", is useful because it fires regardless of autoload
        //but unlike this, is too late to change things on the tag 
        
        var continue_init = element.fire("__constructing__", element);
        if(continue_init === false){
            element.forceremove();
            return false;
        }
        
        //---------- varibles resolved at this point on.
        
        //the drop option will add drag methods to our nametag (another method, _dropChild, is called on children)
        element.drop && element._drop();
        
        /* if the element is marked as being autosized, setup the listens and other methods needed to achieve it */
        if(element.autosized)
            element._autosizingSetup();
          
        //do we want to apply a filelist to this? THIS WILL ADD A .list parameter to this nametag (processed next)
        if(element._filelists && (element.filelist || element.folderlist || element.filefolderlist))
            element._filelists();  
        
        //INTENT: if it's a list type script set a flag and choose the right reload method to run.
        //this also sets a flag so that other parts of the framework can choose to function, depending on if it's list or singleton
        element.reload = element['list'] || element['syncurl'] ? 
            element._reloadAsList :
            element._reloadAsScript;
        
        if(element.list !== undefined || element.syncurl){
            //all the items assocaited with the list. (with a 'uses' script that number is always 1)
            element.items = [];                  
            
            //if they specify drag, but no selectable, make selectable with default of none, none
            if(element.drag && !element.selectable)
                element.selectable = [false, 'none'];
                
            /* routines necessary to turn up/down arrows into general list selection changes. */
            if(element.selectable){
                
                /* if we are selectable or draggable, we are going to need extra methods on ourself to handle click logic: */
                var ClickingMethods = Nametag.Methods.Clicking;
                for(var key in ClickingMethods)
                    element[key] = ClickingMethods[key];
                
                if(gettype(element.selectable) == 'string')
                    element.selectable = stringToList(element.selectable);
                    
                if(element.autoscrollable)
                    element._autoscrollable();

                if(element.keyselectable)
                    element._keyselectable();

                //implement the hoverselectable option    
                if(element.hoverselectable)
                    element._hoverselectable();

                //implement the dragselect1
                if(element.dragselectable)
                    element._dragselectable();
            }
            
            //INTENT: if the filter changes, reevaluate items. as an event rather then method call, other things may react as well.
            listen(element, '__filter__', function(){
                element._evaluateFilter();
            });              
        }
        
        //setup any attributes on ourselves we get from traits. NOTE that 
        //_reevaluateOptions does NOT call this when we are uninitialized, 
        //so as to avoid calling this twice, here and on the first reload.
        element._applyTraits();

        //also, we add any extra classes (as defined by the classes option) onto the tag before we're done.
        if(element.autoload === true && element.classes){
            var classes = stringToList(element.classes);
            for(var i = 0; i < classes.length ; i ++)
                jelement.addClass(classes[i]);
        }

        //INTENT: if autoload is a two element list it is telling us to autoload using the list from the evaluation of
        //the given context/attribute tuple immmediately, and whenever the pair is set()! So very useful and clear 
        //when data global to an application needs to be painted but stay in sync (as well as not needing to load a url repeatedly!)
        if(element.autoload && element.autoload !== true){
            var isNametagEventMethod; 
            
            if(gettype(element.autoload) == 'function')
                element.autoload = element.autoload();
            
            if(!(element.autoload instanceof Array))
                element.autoload = [element.autoload, '__loaded__'];
                
            //if i am true, the method we are listening to is a nametag event method and "false" should not eq. reset.
            if(element.autoload[1].startsendswith("__"))
                isNametagEventMethod = true;

            listen(element.autoload[0], element.autoload[1], function(val){
                /* this is rather cool. instead of just reloading on change, if the target is true reload,
                   and when the (if the) target goes false, and we are not reset, reset. this makes 
                   certain types of view state machines quite nice. */
                if(val || isNametagEventMethod)
                    element.reload();
                else
                    element.reset();
            });
        }
        
        //INTENT: put in a __setup__ event for this nametag, such that it fires regardless of whether autoload is true or false.
        //note this only applies to nametags, not nametag items. 
        Nametag.Runtime.SetupTagEvents.push(element);

        //make sure our element has the class we've given it, since we are singleton script
        if(element.script)
            jelement.addClass(element.script_name);

        //INTENT: Load the list or wait for a manual or event-based reload() call?
        //NOTE that .reload() has been assigned one of two methods depending on list of structural 
        //script to be invoked!
        if(element.autoload === true || element.autoload === undefined)
            Nametag.Runtime.FirstLoadEvents.push(element);
        
        //INTENT: same thing as autoload, but will allow the tag to load the first time; this is triggered only after that.
        if(element.autoreload && element.autoreload !== true){
            var isNametagEventMethod; 
            
            if(gettype(element.autoreload) == 'function')
                element.autoreload = element.autoreload();
            
            if(!(element.autoreload instanceof Array))
                element.autoreload = [element.autoreload, '__loaded__'];
                
            //if i am true, the method we are listening to is a nametag event method and "false" should not eq. reset.
            if(element.autoreload[1].startsendswith("__"))
                isNametagEventMethod = true;

            listen(element.autoreload[0], element.autoreload[1], function(val){
                /* this is rather cool. instead of just reloading on change, if the target is true reload,
                   and when the (if the) target goes false, and we are not reset, reset. this makes 
                   certain types of view state machines quite nice. */
                if(val || isNametagEventMethod)
                    element.reload();
                else if(!element.isReset)
                    element.reset();
            });
        }
        
        /* debug feature: setup a little note that we can see in the debugger that helps us
           equate a dom node with a .tag or .app file, visible in the developer console when
           browsing the document structure. */
        if(Nametag.Runtime.debug){
            if(element.script){
                if(Nametag.Runtime.ScriptReverseAliases && Nametag.Runtime.ScriptReverseAliases[element.script])
                    element.setAttribute("debug_script_path", Nametag.Runtime.ScriptReverseAliases[element.script]);
                else
                    element.setAttribute("debug_script_path", element.script);
            }
            
            if(element.inner_script)
                if(Nametag.Runtime.ScriptReverseAliases && Nametag.Runtime.ScriptReverseAliases[element.inner_script])
                    element.setAttribute("debug_inner_script_path", Nametag.Runtime.ScriptReverseAliases[element.inner_script]);
        }
    
        /* a final event - construct - runs before __init__ and isn't affected by autoload - that's the point */
        element.fire("__constructed__", element);
        
        //apply size on construct so that autoload false, etc containers get their size set, if explicitly given, before we move on.
        /* note we skip ALL hitches by not doing it if the firsr char is % */
        if(element.width && String(element.width)[0] != "%")
            jelement.width(element.width);
        if(element.height && String(element.height)[0] != "%")
            jelement.css('height', element.height);
        if(element.top && String(element.top)[0] != "%")
            jelement.top(element.top);
        if(element.left && String(element.left)[0] != "%")
            jelement.left(element.left);
        
        element.mergespace({
            __after__:element._to_do_on_reload,
            __finally__:element._to_do_on_reload
        });
        
        //finally, we enable four very convienent events (that work well with list-events)
        //for click, doubleclick, keyup and keydown
        
        (element.__click__ || element.__dblclick__) && jelement.singleclick(element._on_click, element._on_dblclick);
        element.__mousedown__ && jelement.mousedown(element._on_mousedown);
        
        //if there is a hover directive and we are not an item of a selectable list (which would do it for us if 
        //mouseselectable is true, otherwise the presence of __hover__ will cause an explict $.hover() event to be added now)
        
        element.__hover__ &&
            jelement.hover(
                element._on_hover_over,
                element._on_hover_out
            );
        
        element.__keyup__ && 
            jelement.keyup(element._on_keyup);
            
        element.__keydown__ && 
            jelement.keydown(element._on_keydown);
            
        element.__change__ && 
            jelement.change(element._on_change);
        
        element.autofocus &&
            element.mergespace({
                __finished__:element._on_autofocus
            });
        
        return element;
    };
    
    /* i like that these are static, for speed sake, instead of being declared inline above. */
    NametagClass.prototype._on_autofocus = function(e){
        Nametag.GUI.focus.setFocused(this);
    };
    
    /* i like that these are static, for speed sake, instead of being declared inline above. */
    NametagClass.prototype._on_mousedown = function(e){
        var self = this;
        return fire(this, '__mousedown__', e) || false;
    };

    NametagClass.prototype._on_click = function(e){
        var self = this;
        return fire(this, '__click__', e) || false;
    };
    
    NametagClass.prototype._on_dblclick = function(e){
        var self = this;
            fire(this, '__dblclick__', e) || false;
    };
    
    NametagClass.prototype._on_hover_over = function(e){
        var self = this;
        return fire(this, '__hover__', true, e) || false;
    };
    
    NametagClass.prototype._on_hover_out = function(e){
        var self = this;
        return fire(this, '__hover__', false, e) || false;
    };
    
    NametagClass.prototype._on_change = function(e){
        var self = this;
        return fire(this, '__change__', e) || false;
    };
    
    NametagClass.prototype._on_keydown = function(e){
        var self = this;
        return fire(this, '__keydown__', e) || false;
    };
    
    NametagClass.prototype._on_keyup = function(e){
        var self = this;
        return fire(this, '__keyup__', e) || false;
    };
    
    /* this code sets selection on us if selectfirst is set, that's all */
    
    /* we want to run _updateAttributes on both __after__ and __finally__, however, note it 
      has local state to help it skip the first __after__, such that sending events occurs
      on __finally__ and every __after__ there after. */
    NametagClass.prototype._to_do_on_reload = function(){
        var self = this;
        
        /* skip the first after - we should run on the first finally, and then the afters after that */
        if(!self._firstAfterOccured){
            self._firstAfterOccured = true;
            return;
        }
        
        /* if we are supposed to, select the first self on after */ 
        if((!self.initialized || !self.stickyselected) && self.list && self.selectfirst && self.items.length)
            self.items[0].setSelection();
    };
    
    /* Namespace merging: */

    /* This method is, on it's own, the means by which sources of methods being compiled onto an element 
    may be applied without overwriting each other. */

    /* The very idea of a 'trait', or orthogonal behavior, is running many function for the same event, but some 
    sweeter features have been included. if the function starts/ends with "__" then it is chained,
    otherwise, if it's a method, then it is overwritten but has a .super attr available, and all else
    it will merely overwrite it as normal. */

    /* This is a "runtime" inheritance system, in the sense that live composition prepares each
    element as it is created (or applied to another element) */
    NametagClass.prototype.mergespace = function(source, element, forcechain){ /* forcechain will chain all methods, regardless if they start with __ or not */
        
        /* THIS is where "self" actually automatiaclly comes from when merging spaces, FWIW */
        var self = this;
        element = element || self;
        
        //if there is an exception, this puts a nicely printed statement into Nametag.Debugger.exceptions, which, if it exists, 
        //if then further pretty printed into the debugger/console.
        var generateError = function(context, new_entry, err){
            if(!Nametag.Debugger.exceptions.length){
                var roots = [];
                var root = context.root;
                
                while(root){
                    roots.push(root.script);
                    root = root.root;
                }
                
                roots.reverse();
                Nametag.Debugger.exceptions.push(String(err) + "\n\nROOTPATH: "+roots.join(', ')+"\n\nIN METHOD "+key+"\n----------------------\n" + Nametag.Runtime.addLineNumbers(String(new_entry)));
            }
                
            else
                Nametag.Debugger.exceptions.push("CALLED FROM "+key+"\n----------------------\n" + Nametag.Runtime.addLineNumbers(String(new_entry)));
        };
        
        for(var key in source){
            var new_entry = source[key];
            var existing_entry = element[key];

            /* VERY IMPORTANT: only merge methods if are still uninited. this works together
               with the reload mechanism to reset state of attributes each reload, 
               but not reapply methods when already applied. */
            if(!element.initialized || forcechain){
                if(gettype(new_entry) == 'function'){

                    /* if the option from the trait starts and ends with '__' then chain it */
                    if((key.slice(0, 2) == "__" && key.slice(-2) == "__") || forcechain){
                        /* Yay closures. this new method will call the existing method. Chaining. */
                        new_entry = function(self, existing_entry, new_entry, key){
                            return function(){
                                var retval1 = undefined, retval2 = undefined;
                                if(existing_entry)
                                    retval1 = existing_entry.apply(self, arguments);
                                    
                                try{
                                    retval2 = new_entry.apply(self, arguments);
                                }catch(err){
                                    generateError(self, new_entry, err);
                                    throw err;
                                }
                                
                                return retval1 !== undefined ? retval1 : retval2;
                            };
                        }(element, existing_entry, new_entry, key);
                    }

                    /* if it DOESNT start with __ then we overwrite the old with the new method, 
                    and the method can now call element.__super__(args) to run the method it 
                    overwrote. */
                    else{
                        new_entry = function(self, existing_entry, new_entry, key){
                            return function(){  
                                try{
                                    self.__super__ = existing_entry ? existing_entry : false;
                                    var ret = new_entry.apply(self, arguments);
                                    self.__super__ = false;
                                    return ret;
                                }catch(err){
                                    generateError(self, new_entry, err);
                                    throw err;
                                }  
                            };
                        }(element, existing_entry, new_entry, key);
                    } 
                }

                /* overwrite the existing value if any, now that a method has been made to perform chaining or inheritng (above) if needed. */
                element[key] = new_entry;
            }

            /* else if it's after init, if we can't chain it or super it, then don't
               write it if it already exists. Intelligent! */
            else if(gettype(new_entry) != 'function' && !element[key])
                element[key] = new_entry;
                
            new_entry = null;
            existing_entry = null;
        }
        
        element = null;
    };
    
    /* a data structure is kept of what targets/attributes/hitches we've set up
       at init, we will use this information to run these hitches as if
       the target fired, but with the value the target has being applied to this node only, for efficiency. 
       the concept is that some attributes are special (Nametag.Runtime.attributes_to_autohitch).
       It would be required to set up hitches whose default values were the value of the target as boiler plate,
       so that new nodes appeared at the right position witout the target knowing about them, and i also believe the 
       "special set" of width, height, top, left, opacity is basic and easily explainable. For background, "normal" hitches 
       do not evaluate until the  target fires for the first time but you can give a default value.
       Its not crucial to the more common hitch state machines I used, so I limited the behavior to attributes_to_autohitch,
       again, for efficiency and brevity in setup. */
    NametagClass.prototype._performAutohitches = function(){
        var self = this;
        var jself = $(self);
        
        while(self._autohitches.length){
            var item = self._autohitches.pop();
            var obj = item[0], 
                attr = item[1], 
                hitch = item[2];
            
            /* run the hitch. it has the ability to set self, by itself, without us using the return value here */
            try{
                hitch.call(self, obj[attr]);
            }catch(e){
                Nametag.Debugger.error("NametagOS Engine --------------------------\nHitch Error ------------\n    "+String(e)+"\n\nTarget was: "+item[3]);
            }   
        }
    };
    
    /* INTENT: this will listen to changes in dimension, allowing us to use JQuery 
       to perform the actual sizing. Dynamic size is a basic feature esp. in regard
       to hitches, and so is deemed important enough to have on by default. 
       the existance of the variable 'autosized' == false will prevent this, if some algo
       will run faster that way and as needed. */
    
    NametagClass.prototype._autosizingSetup = function(){
        var self = this;
        var jself = $(self);
        
        var autoduration = parseInt(self.autoduration) || Nametag.GUI.duration;

        /* do we animate any of these attributes? if yes, then do we do them all? or just some? so autoanimated can eq. false, true, or a list or comma-sep string of dimensions to animate. */
        if(!self.autoanimated)
            var attributes_to_animate = [];
        
        else{
            var attributes_to_animate = 
                self.autoanimated === true || self.autoanimated.trim().toLowerCase() == 'true' ? 
                    Nametag.Runtime.attributes_to_autohitch :
                    stringToList(self.autoanimated);
        }
        
        ///// TOP
        
        if(attributes_to_animate.indexOf("top") !== -1){
            listen(self, 'top', function(val){
                if(String(val).slice(0, 1) == '%') return;
                jself.animate({top:val}, {duration:autoduration || Nametag.GUI.duration, queue:false});
            });
        }
            
        else
            listen(self, 'top', function(val){
                if(String(val).slice(0, 1) == '%') return;
                
                if("px%".indexOf(String(val).slice(-2)) === -1)
                    val += 'px';
                
                jself.top(val);
            });
            
        ///// LEFT
        
        if(attributes_to_animate.indexOf("left") !== -1)
            listen(self, 'left', function(val){
                if(String(val).slice(0, 1) == '%') return;
                
                if("px%".indexOf(String(val).slice(-2)) === -1)
                    val += 'px';
                
                jself.animate({left:val}, {duration:autoduration || Nametag.GUI.duration, queue:false});
            });
        
        else
            listen(self, 'left', function(val){
                if(String(val).slice(0, 1) == '%') return;
                
                if("px%".indexOf(String(val).slice(-2)) === -1)
                    val += 'px';
                
                jself.left(val);                
            });
        
        ///// OPACITY
                 
        /* if we are animating in the opacity dimension */
        if(attributes_to_animate.indexOf("opacity") !== -1)
            listen(self, 'opacity', function(val){
                if(String(val).slice(0, 1) == '%') return;
                jself.animate({opacity:val}, {duration:autoduration || Nametag.GUI.duration, queue:false});
            });
            
        /* or if we are not animating opacity, per normal. */
        else
            listen(self, 'opacity', function(val){
                if(String(val).slice(0, 1) == '%') return;
                jself.css("opacity", val);
            });
        
        ///// HEIGHT
        
        if(attributes_to_animate.indexOf("height") !== -1)
            listen(self, 'height', function(val){
                if(String(val).slice(0, 1) == '%') return;
                if("px%".indexOf(String(val).slice(-2)) === -1)
                    val += 'px';
                jself.animate({height:val}, {duration:autoduration || Nametag.GUI.duration, queue:false});
            });
        
        else
            listen(self, 'height', function(val){
                if(String(val).slice(0, 1) == '%') return;
                if("px%".indexOf(String(val).slice(-2)) === -1)
                    val += 'px';
                jself.css('height', val);
            });
        
        ///// WIDTH
        
        if(attributes_to_animate.indexOf("width") !== -1)
            listen(self, 'width', function(val){
                if(String(val).slice(0, 1) == '%') return;
                if("px%".indexOf(String(val).slice(-2)) === -1)
                    val += 'px';
                jself.animate({width:val}, {duration:self.autoduration || Nametag.GUI.duration, queue:false});
            });
        
        else
            listen(self, 'width', function(val){
                if(String(val).slice(0, 1) == '%') return;
                if("px%".indexOf(String(val).slice(-2)) === -1)
                    val += 'px';
                jself.css("width", val);
            });        
    };
    
    /* We say shuffle instead of bringToFront because this doesn't use css z-order, but actually shuffles the child to front  */
    NametagClass.prototype.shuffleToFront = function(child){
        if(child)
            this.appendChild(child); //well that was easy
        
        //if we call w/no params assume we meant to shuffle OURSELVES back.
        else
            $(this).parent()[0].appendChild(this);
    };
    
    /* We say shuffle instead of bringToFront because this doesn't use css z-order, but actually shuffles the child to front  */
    NametagClass.prototype.shuffleToBack = function(child){
        if(child && this.firstChild != child)
            this.insertBefore(child, this.firstChild); //well that was easy too
        
        //if we call w/no params assume we meant to shuffle OURSELVES back.
        else{
            var parent = $(this).parent()[0];
            parent.insertBefore(this, parent.firstChild)
        }
    };
    
    /* We say shuffle instead of bringToFront because this doesn't use css z-order, but actually shuffles the child to front  */
    NametagClass.prototype.shuffleItemBehind = function(child, behind){
        this.insertBefore(child, behind); //well that was easy too
    };
    
    //given an html element (a "node"), find the first parent with an "obj" attribute.
    //in the Nametag architecture, this will always be the script instance parent to 
    //the node passed as being where to start ("here").
    NametagClass.prototype.getParentItem = function(){
        var node = $(this);

        //go up until we find what we want
        while(node = node.parent()){    
            
            //which is a element with a .nametag reference
            if(node[0].itemlist)
                return node[0];    
            
            //or none, if we run out of dom above us to check
            else if(node[0] === undefined)
                return false;        
        }
    };
    
    //I will find the first thing above me with the attr name given, 
    //optionally of the first such attr to be eq. to value, as we go up
    NametagClass.prototype.lookup = function(attr, testfunc){
        
        /* promote the expression string to a real function */
        if(testfunc && gettype(testfunc) !== 'function')
            eval("testfunc = function(self){return "+testfunc+"};");
        
        //we specifically DO want to find something on ourselves before we look to parent, in this algo.
        var scope = this;
        
        while(scope){
            if(scope[attr] && (testfunc === undefined || testfunc.call(scope, scope)))
                return scope[attr];
            else
                scope = scope.parentNametag;
        }
               
        return false;
    };
    
    //I will return the first nametag above me to have the given attribute (i dont return the attribute as lookup itself does.)
    //NOTE that unlike lookup, the scope for this operation starts on the first parent, not itself (as do all the lookup* other methods other than lookup() itself);
    NametagClass.prototype.lookupobject = function(attr, testfunc){
        /* promote the expression string to a real function */
        if(testfunc && gettype(testfunc) !== 'function')
            eval("testfunc = function(self){return "+testfunc+"};");
        
        //we specifically DO want to find something on ourselves before we look to parent, in this algo.
        var scope = this.parentNametag;
        
        while(scope){
            if(scope[attr] && (testfunc === undefined || testfunc.call(scope, scope)))
                return scope;
            else
                scope = scope.parentNametag;
        }
               
        return false;
    };
    
    //like .lookup, except that you can pass a value (after the optional test function), that will
    //cause a set to occur on that scope by that attr with the value given.
    NametagClass.prototype.lookupset = function(attr, testfuncOrValue, value){
        var scope = this.parentNametag;
        
        /* promote the expression string to a real function */
        if(value !== undefined && gettype(testfuncOrValue) !== 'function')
            eval("testfuncOrValue = function(self){return "+testfuncOrValue+"};");
        
        while(scope){
            if(scope[attr] && 
                ((testfuncOrValue !== undefined && value !== undefined && testfuncOrValue.call(scope, scope)) || (value === undefined))){
                set(scope, attr, value !== undefined ? value : testfuncOrValue);
                return scope;
            }
                
            else
                scope = scope.parentNametag;
        }
               
        return false;
    };
    
    //like .lookup, except that you can pass a value (after the optional test function), that will
    //cause a set to occur on that scope by that attr with the value given.
    NametagClass.prototype.lookuplisten = function(attr, testfuncOrValue, value){
        var self = this;
        
        /* promote the expression string to a real function */
        if(value !== undefined && gettype(testfuncOrValue) !== 'function')
            eval("testfuncOrValue = function(self){return "+testfuncOrValue+"};");
        
        var scope = this.parentNametag;
        
        while(scope){
            if(scope[attr] && 
                ((testfuncOrValue !== undefined && value !== undefined && testfuncOrValue.call(scope, scope)) || (value === undefined))){
                self.listen(scope, attr, value !== undefined ? value : testfuncOrValue);
                return scope;
            }
                
            else
                scope = scope.parentNametag;
        }
               
        return false;
    };
    
    //INTENT: scriptroot is the way we can share a common ancestor when writing templtes with
    //various internal components in a non-fragile way.
    //given an html script, find the first parent who has been marked as being generated by a script
    //and not anonymous script. Optimize by using the scriptroot above us, if present.
    NametagClass.prototype._getScriptroot = function(){
        var node = $(this);

        //go up until we find what we want
        while(node = node.parent()){
            if(node[0] === undefined)
                return false;

            var possible_nametag_element = node[0]; 
            
            //which is a element with a .nametag reference
            if(possible_nametag_element.nametag){
                
                //which is the scriptroot if 'script' is defined
                if(possible_nametag_element.script)
                    return possible_nametag_element;

                //or has a good reference to the closest scriptroot, so why not just return it?
                else if(possible_nametag_element.scriptroot)
                    return possible_nametag_element.scriptroot;
            }
        }
    };
    
    //INTENT: do the logic to find and apply all trait methods to the reloading object
    //(the XML will be applied later, in _initNametag())
    NametagClass.prototype._applyTraits = function(){
        var self = this;
        var jself = $(self);
        
        //traits are just other script tags (classes) and so are nicely stored - if we have them, 
        //we use their values stored so as to apply the trait piece by needed piece. A twist is that
        //we support three types of application of trait: all methods starting with __ are chained,
        //all other methods will overwrite each other but can access their predecssor by calling 'super()',
        //and finally everything else just overwrites itself. this lets us do great things with traits,
        //and we got the feature cheaply, below:
        
        //if we have traits, reduce them to a list from comma sep. if not already that way
        self.traits = !(self.traits instanceof Array) ? stringToList(self.traits) : self.traits;
        
        //if we have any traits that were registered when scanning options for special values, make sure they are included.
        self.traits.extend(self._traitsFromOptions);

        //the _traits_to_make depend on self.traits, but also on the set of traits in ExtendsTemplateLookup...
        self._traits_to_make = [];
        for(var i = 0; i < self.traits.length ; i ++)
            self._traits_to_make.push(self.traits[i].indexOf("/") == -1 ? "*/"+self.traits[i] : self.traits[i]);
        
        if(self.script){
            //and, using ExtendsTemplateLookup if we are a script (and not anonymous), add 
            //in what the ExtendsTemplateLookup says we should also use as traits..
            var name_to_use = self.script.indexOf("/") == -1 ? "*/"+self.script : self.script;
            var extend_by = Nametag.Runtime.ExtendsTemplateLookup[name_to_use] || [];
            for(var i = 0; i < extend_by.length ; i ++)
                self._traits_to_make.push(extend_by[i]);
        }
        
        //for each trait we are to apply:
        for(var i = 0; i < self._traits_to_make.length ; i ++){
            
            //the fully qualified server name to use
            var server_and_name = self._traits_to_make[i];
            
            //if the trait class has not been loaded into the cache (and thus processed) do so now.
            if(!Nametag.Runtime.CompiledTemplateCache[server_and_name])
                Nametag.Runtime.TemplateCache(server_and_name);
            
            //make a little data structure with what we need to apply a trait
            var methods = Nametag.Runtime.CompiledTemplateOptionsCache[server_and_name] ? 
                Nametag.Runtime.CompiledTemplateOptionsCache[server_and_name].call(self, self) :
                {};
               
            //The very idea of a trait is to chain initstage methods, so all of them run together... But some 
            //sweeter features have been included. if the function starts with "__" then it is chained,
            //otherwise if it's a method then it is overwritten but has a .super attr set that points to what
            //it overwrote so that .super can be used inside that method(!), and all else merely overwrites.
            //I call this a 'contextual' inheritance system, designed for runtime use in diff. "modes". 
            self.mergespace(methods);   
        
            //Aha, i had not applied this here as i should have, works now, per our "boiler plate" namespace merging algorithm
            //this processes all strings through self.scanAttributes, for %{} and %%{} types
            var strings_to_process = {};
            for(var key in methods)
                if(gettype(methods[key]) == 'string' || key.slice(0,1) == "$")
                    strings_to_process[key] = methods[key];
            copy(self.scanAttributes(strings_to_process, self), self);
            
            jself.addClass(self._traits_to_make);
            
            //also, we add any extra classes (as defined by the classes option) onto the tag before we're done.
            if(methods.classes){
                var classes = stringToList(methods.classes);
                for(var i = 0; i < classes.length ; i ++)
                    jself.addClass(classes[i]);
            }
        }
    };
    
    /* autoscrollable is way of causing an element that recieves selection to move itself into view
       if not already. By using selection, it works automatically with key events, mouse, everything.  
       there is one arg - an element that has a height we should use when calc'ing our viewport (vertically)
    */
    NametagClass.prototype._autoscrollable = function(){
        var self = this;
        self.mergespace({
            __init__:function(){
                $(self).addClass('rel');
            },
            
            __selection__:function(item){
                self._pauseScrollUpdating = true;
                
                var jself = $(self.autoscrollable !== true ? self.autoscrollable : self);
                var element_height = self.height || jself.height();
                var item_height = item.height || $(item).height();

                //make the column scroll to show an item in the center if an item with selection is outside the viewport.
                if(self.scrollTop-item.offsetTop > 0 || self.scrollTop+element_height-item_height < item.offsetTop){
                    if(item_height >= element_height)
                        var where_to = item.offsetTop+5;
                    else
                        var where_to = item.offsetTop-(element_height/2)+(item_height/2);
                    jself.animate({
                        scrollTop:
                            where_to
                    }, Nametag.GUI.duration/2);
                }

                self._pauseScrollUpdating = false;
            }
        });
    };
    
    //we can use this like forceremove to cause reloading even when __reloading__ is present
    NametagClass.prototype.forcereload = function(data){
        var self = this;
        self.reload(data, true);
    };

    //INTENT: reload a script made once (via the new NametagClass.prototype.ExpandNametags method)
    //note that reloading also reevaluates the query given in the
    //inner text of the script, so that reloadng also refreshes.
    NametagClass.prototype._reloadAsScript = function(data, forcereload){
        var self = this;
        var jself = $(self);
        
        //prepare the item into an object if not already an object
        data = data || {};
        if(!(data instanceof Object))
            data = {item:data};
            
        /* THIS is how init gets called! it's out of order with all other events because it runs BEFORE 
           the painting of XML, not deferred like all else. This allows __init__ to affect variables in [=x=] clauses */
        if(!self.initialized)
            data = self.fire('__init__', data || self.data) || data;
        else    
            data = self.fire('__reloading__', data || self.data) || data;
        
        //if we have been made and are not already reset, then reset ourselves unconditionally (1starg=true)
        if(self.initialized && !self.isReset) 
            self.reset(true);
                
        //mark we are now dirty
        self.set('isReset', false);
        
        self._reevaluateOptions(data);
          
        data = self.fire('__preloading__', data || self.data) || data;   
        data = self.fire('__loading__', data || self.data) || data;   
        
        //update the values of the nametag from the attrs via xml, the codeblock, etc. to set ourselves up for this run.
        self._reevaluateOptions(data);
            
        //this always has the evaluated js array - since list may be 
        //a string yet we want access to the evaluation not the list option itself
        self.evaluated_list = [self];
        
        try{
            var new_item = createJQueryTemplateUsingNametag_andData_at(self, self, self)[0];
        }catch(e){
            throw "(an error occurred)\n\n"+e+', script name '+(self.script || self.inner_script)+"\n\nHTML of target is: "+$("<div></div>").append(self).html();
        }
        
        //make sure our element has the class we've given it, since we are singleton script
        if(self.script)
            jself.addClass(self.script_name);

        //also, we add any extra classes (as defined by the classes option) onto the tag before we're done.
        if(!self.initialized && self.autoload !== true && self.classes){
            var classes = stringToList(self.classes);
            for(var i = 0; i < classes.length ; i ++)
                jself.addClass(classes[i]);
        }
            
        //always initialize the nametag, as a list, as well as the item that was made with it.
        self._initNametag();
        
        return this;
    };
    
    //INTENT: reload the nametag, from a list list either locally or remotely
    //the reload method will call the server and repaint the results. This 
    //can be delayed by setting autoload to false...
    NametagClass.prototype._reloadAsList = function(data){
        var self = this;
        
        var jself = $(self);
        
        if(!self.initialized){
            var classes = stringToList(self.classes);
            
            data = self.fire('__init__', data) || data;   
            
            //also, we add any extra classes (as defined by the classes option) onto the tag before we're done.
            if(self.autoload !== true && self.classes)
                for(var i = 0; i < classes.length ; i ++)
                    jself.addClass(classes[i]);
        }
        
        else
            data = self.fire('__reloading__', data || self.data) || data;
        
        /* this will remain false if there was no selection, or the options dont call for remembering it
           by remaining false, no action will be taken to restore selection below */
        var was_selected = [];
        
        /* we do not reset if we are uninitialized; nothing to reset. */     
        if(self.initialized){
            
            /* if there is a selection save it for restoration at the end of the reload below */
            if(self.stickyselected && self.selectedItems.length)
                for(var i = 0; i < self.selectedItems.length ; i ++)
                    was_selected.push(deepcopy(self.selectedItems[i].data));
            
            /* otherwise reset dumps all contents in our usual pattern. */
            else if(!self.isReset)
                self.reset(true);   
        }
        
        //mark we are now dirty
        self.set('isReset', false);

        if(this.selectedItems)
            this.selectedItems = [];

        self.items = new Array;
        
        self._reevaluateOptions();
        
        data = self.fire('__preloading__', data) || data;   
        data = self.fire('__loading__', data) || data;   
        
        //update the values of the nametag from the attrs via xml, the codeblock, etc. to set ourselves up for this run.
        self._reevaluateOptions();
        
        //preprocess attributes (str to list, mostly)
        if(gettype(self.selectable) == 'string')
            self.selectable = stringToList(self.selectable);    
        
        //if a script is being used (not inner_script) then process and cache it to have its defaults handy.
        if(self.script)
            Nametag.Runtime.TemplateCache(self.script);
            
        //if we are passed data, use that as list! otherwise use self.list, or []...
        self.list = data ? data : (self.list ? self.list : []);    
        
        //use list below for convenience                 
        var list = self.list;
        
        //if what they give is a method, run it. This is useful when you want a value to exist
        //on first load, not on first parse [of the text inside of a tag]
        if(gettype(list) == 'function')
            list = list.call(self, self);
            
        //if the new data is a single object change it to a list w/1 item
        if(!(list instanceof Array))
            list = [list];

        //INTENT: if they pass a literal array, we'll be nice and cast it to [{item:value}, {item, value}, etc.]
        //so it can be used in var replacment. So item and i are the listitem and the index. 
        if(list && list.length && gettype(list[0]) != "object"){
            var tmp_data = [];
            for(var i = 0; i < list.length ; i ++)
                tmp_data.push({item:list[i]});
            list = tmp_data;  
        }
        
        //use the list to create objects as indicated, init the list, and move on!
        //self.list = list;
        
        //this always has the evaluated js array - since list may be 
        //a string yet we want access to the evaluation not the list option itself
        self.evaluated_list = list;
        
        //create the items - that is, scripts - inside ourselves using the list
        //of data provided. Note that attributes/methods on the script OTHER then
        //the initstage methods will NOT
        //be mapped onto the item, as list items merely use XML and none of the methods
        self._createItemsFromObjs(list);
    
        //init ourselves
        self._initNametag();
        
        /* if there was a selection, use the data from it 
           to try and find it again, if it exists */
        if(was_selected.length)
            self._stickySelectedMethod(was_selected);
        
        return this;      
    };
    
    //abstracts reselecting selected elements on reload - depends on code in reload to record selected 
    //items if stickyselected is true.
    NametagClass.prototype._stickySelectedMethod = function(was_selected){
        var self = this;
        
        for(var i = 0; i < was_selected.length ; i ++){
            /* only compare non-object items for equality */
            for(var key in was_selected[i])
                if(was_selected[i][key] instanceof Object)
                    delete was_selected[i][key];

            /* (and skip 'i' too) */
            if(was_selected[i].i !== undefined)
                delete was_selected[i].i;

            var item = self.findItem(was_selected[i]);
            if(item)
                item.uneventfulSelect();    
        }
    };
    
    /* I will perform the operations needed to take the attributes and codeblock of a nametag
    and set on it and it's element the nescessary values in the right order. */
    
    /* this looks more complex then it needs to be because it handles loading right away, loading after autoload was false,
       and reloading, which taken as a system have some specific demands, to be able to call .reload() in such a carefree manner */
    NametagClass.prototype._reevaluateOptions = function(data){
        var self = this;
        
        //if we dont have a .data attribute (for stuff passed into the nametag) make one
        if(!self.data)
            self.data = {};
            
        //map all attributes of our target onto our options, but only on the first load.
        //after than 
        if(!self.initialized){
            /* we will prevent ourselves from uselessly reevaluating these if we already set them on construct, 
               however, attributes other than these with percent statements will continue to be evaluated then and now,
               since we dont know what might have changed, even betwen construct and autoload (which are seperated by 
               when they are made to when they are processed by the ExpandNametag)*/
            var skipAttrs = self.autoload && !self.initialized ? ['script', 'inner_script'] : [];
            
            var attr_dict = {};
            for(var i = 0, attr; (attr = self.attributes[i]) ; i ++)
                if(skipAttrs.indexOf(attr.nodeName) === -1)
                    attr_dict[attr.nodeName] = attr.nodeValue;
            elementcopy(self.scanAttributes(attr_dict, self, false, undefined, true), self);
        }
        
        //if data is passed in, use it in place of our current data.
        if(data){
            elementcopy(data, self.data);
            elementcopy(self.data, self);
        }
            
        return self;
    };
    
    /* INTENT: initialize an item in a list by setting it's data, any built in traits, 
    and scheudling it's initstage methods -- before calling new Nametag.Runtime.ExpandNametags to recurse
    and complete the pattern that will create the final item. */
    NametagClass.prototype._initItem = function(item, obj, doNotAddToChildren){        
        var self = this;
        
        if(obj === undefined)
            obj = {};
            
        if(!item)
            throw "A script is empty - at least one node required. script:\n"+self.script;
        
        //a reference to the nametag managing this item
        item.itemlist = self;
        
        //a reference to the object used to create the item
        item.data = obj;
        item.data.self = self;
        item.scriptroot = item.itemlist.scriptroot;
            
        //only need to do this if we're making items not touching up the item made for a singleton script
        //add the item to the children of nametag -- unless doNotAddToChildren is true
        if(doNotAddToChildren === undefined)
            self.items.push(item);
            
        /* this goes on all items, shadow or otherwise */
        var DataMethods = Nametag.Methods.Data;
        for(var key in DataMethods)
            item[key] = DataMethods[key];
            
        /* if we are initializing an actual element, apply behaviours the element needs to work with lists. */
        if(item.ELEMENT_NODE !== undefined){
            //also, we add any extra classes (as defined by the classes option) onto the tag before we're done.
            if(item.classes){
                var classes = stringToList(item.classes);
                for(var i = 0; i < classes.length ; i ++)
                    $(item).addClass(classes[i]);
            }

            //an extremely useful shortcut to find named items inside of ourselves (so useful i hardbake it here)
            item.jchild = self.jchild;
            item.jnamed = self.jnamed;
            item.jsibling = self.jsibling;
            
            item.child = self.child;
            item.named = self.named;
            item.sibling = self.sibling;
            
            item.hasChild = self.hasChild;
            item.hasNamed = self.hasNamed;
            item.hasSibling = self.hasSibling;
            
            if(self.selectable)
                self._selectableItem(item);

            //the drag option will add drag methods to our nametag - uniformly applied to children.
            if(self.drag)
                self._dragItem(item);

            //droponchild means that not only will the container, but actually the children, be responsible for the click and 
            //depends on event bubbling...
            if(self.droponchild)
                self._dropChild(item);

            //every instance of every script is given it's own css entry automatically. I found myself including it with 
            //all the widgets anyway.
            if(self.script_name)
                $(item).addClass(self.script_name);
                
            //if a third selection state is available (the 'default' state, if one is even needed) apply right away
            //as well as after hoverout and unselect
            if(self.selectable[2])
                $(item).addClass(self.selectable[2]);
                
            if(!self._use_shadow_items){
                Nametag.Runtime.LoadItemEvents.push([self, item]);
                Nametag.Runtime.LoadedItemEvents.push([self, item]);
            }
            
            //the workhorse, here we allow any sub-nametags to have their 15 milliseconds of fame, recursing to create
            //itself as we have already done for this nametag.
            Nametag.Runtime.ExpandNametags(item);
        }
        
        //if we are initializing a _use_shadow_item node, and we're selectable, 
        //give the item what it needs to participate in selection
        //(_selectbleItem() did that, in the above block)
        else if(self.selectable){
            var SelectingMethods = Nametag.Methods.Selecting;
            for(var key in SelectingMethods)
                item[key] = SelectingMethods[key];
        }

        return item;
    };
    
    //INTENT: create all the items in the list! The Basic Tag Algorithm!    
    //I draw the all the content for a list given a set of objs.
    //NOTE I exist (and am not factored into a 1 create per item) for efficiency,
    //making the list without unneeded method nesting - and allowing jquery scripts to also create
    //in bulk (which may be alot faster, depending on how they did it)
    NametagClass.prototype._createItemsFromObjs = function(objs){
        var self = this;
        
        //calculate the full script name for use in places.
        if(self.script && self.script.indexOf("*") == -1){
            self.script_name = self.script;
            self.script =  (self.server || "*")+"/"+self.script;
        }
                        
        /* make all the items in a list, using the set of returned new nodes as the set of nodes
           to initialize via _initItem() */
        try{
            var new_objs = [];
            self.items = [];
            
            /* create the initial data for the list. provide a counter, i, as a courtesy */
            for(var i = 0; i < objs.length; i ++){
                var new_obj = copy(objs[i], {});
                new_obj.i = i; /* 'i' is constantly overwritten/updated, providing a real counter; not an independent state variable. */
                
                if(self.__preloadingitem__)
                    new_obj = self.__preloadingitem__(new_obj) || new_obj;
                if(self.__loadingitem__)
                    new_obj = self.__loadingitem__(new_obj) || new_obj;
                
                new_objs.push(new_obj);
            }
            
            /* IMPORTANT: make all the xml for all scripts in one go - the reason for two types of nametags, ultimately! */
            var new_items = createJQueryTemplateUsingNametag_andData_at(self, new_objs, self);
            if(!new_items) return;

            /* it's a bad error to have an unequal num of input and output nodes, always signifying bad logic */
            if(new_items.length != new_objs.length)
                throw "A list-nametag whos script-to-use has more then one top level node has been found. Templates used in a list mode nametag may only have one top level element, at script: "+self['script']+self['inner_script']+"\n\nDir of new_items"+dir(new_items);
            
            /* initalize (set up deferreds to be run later) every new item with it's data */
            for(var i = 0 ; i < new_items.length ; i ++)
                self._initItem(new_items[i], new_objs[i]);
        }
        
        catch(err){
            throw 'An error in a script ('+(self['script'] || "anonymous script")+' most likely), is: \n'+err+"\n\n whos html is:\n\n"+$("<div></div>").append(self).html();
        }
    };
    
    //INTENT: update items in a list more efficiently then erasing and redrawing the whole list.
    NametagClass.prototype._updateItemsUsingObjs = function(updated_items, objs){
        var items_to_be_removed = [];
        var new_items = new Array;

        //the idea is that we return a new set of items to replace the old
        //where those that are deleted are not included, and erased afterwards.
        for(var i = 0 ; i < objs.length ; i ++){
            //if the object is false, merely pass the item on untouched
            if(objs[i] === false)
                new_items.push(updated_items[i]);
                
            //if the return obj has keys, refresh the item with that obj
            else if(gettype(objs[i]) == 'object' && getkeys(objs[i]).length)
                new_items.push(updated_items[i].refresh(objs[i]));
                
            //if the dict is empty delete the obj (after we've updated everything else, to be a little saner ui-wise).
            else
                items_to_be_removed.push(updated_items[i]); 
        }
        
        //delete all objs that were empty in the return objs
        for(var i = 0 ; i < items_to_be_removed.length; i ++)
            items_to_be_removed[i].remove(); 
            
        return new_items;
    };
    
    //INTENT: do whatever is needed right after a list is created.
    NametagClass.prototype._initNametag = function(){
        var self = this;
        var jself = $(self);
        
        //NOTE: do these events on every reload
        Nametag.Runtime.LoadingTagEvents.push(self);
        Nametag.Runtime.LoadedTagEvents.push(self);
        Nametag.Runtime.AfterTagEvents.push(self);
        
        //make the string a list as needed to reference info
        if(self.drop && gettype(self.drop) == 'string')
            self.drop = stringToList(self.drop);
            
        if(self.drag && gettype(self.drag) == 'string')
            self.drag = stringToList(self.drag);
   
        if(!self.initialized){
            //NOTE: do these events on the first load only
            Nametag.Runtime.ReadyTagEvents.push(self);
            Nametag.Runtime.FinallyTagEvents.push(self);
            Nametag.Runtime.FinishedTagEvents.push(self);
            Nametag.Runtime.PenultimatelyTagEvents.push(self);
            Nametag.Runtime.UltimatelyTagEvents.push(self);
            
            /* make hitched attributes get their first value by assigning _performAutohitches to run on 
               finished (an event made for this need and function like init in going top to bottom).  */
            self.mergespace({
                __finished__:self._performAutohitches
            });
               
            /* text areas and inputs need to be text-selectable by default */
            if(['TEXTAREA', 'INPUT'].indexOf(self.tagName.toUpperCase()) !== -1)
                jself.addClass("selectable");
                
            else if(self.selectable && self.textselectable === false)
                jself.addClass("notselectable")
                
            else
                jself.addClass("selectable");
        }
        
        //INTENT: ENABLING TRAITS. This second half applies the XML from the script,
        //we had applied methods earlier in the process, in _reevaluateOptions()
        for(var i = 0; i < self._traits_to_make.length ; i ++){
            //make a little data structure with what we need to apply a trait
            var script = Nametag.Runtime.CompiledTemplateCache[self._traits_to_make[i]];
            
            //the trait object will have a script attr - use to append to current target if present!
            try{
                if(script)
                    $.tmpl(script, self).appendTo(self);
            }catch(err){
                err.message = "There was a problem when making the template associated with the trait "+self._traits_to_make[i]+".\n\n";
                throw err;
            }
        }
    
        if(self.__filter__)
            send(self, '__filter__');   
        
        //IMPORTANT! This call ensure that any nametags/handlers created as part of this nodes creation
        //are themselves now processed. The Nametag.Runtime.ExpandNametags() call that first made us finds all nodes
        //before it called any, so any new nametags would have to be caught here, and so recursion continues on.
        Nametag.Runtime.ExpandNametags(self);
        
        //this indicates we have loaded for the first time. Tada!
        self.initialized = true;
    };
    
    //INTENT: call remove such that it wont fire erase - just erase it all.
    NametagClass.prototype.forceremove = function(noNewSelection){
        this.remove(noNewSelection, true);
    };
    
    NametagClass.prototype.removeItems = function(items){
        if(!(items instanceof Array))
            items = [items];
    
        /* lol. if we dont copy the list, then as items are removed 
           from selectedItems (for instance, if passed in) they will
           cause this loop to misfire.  */
        items = copy(items, []);
        
        for(var i = 0; i < items.length ; i ++)
            items[i].remove(true, undefined, true);
        
        this.fire('__subtracted__', [items]);
        this.fire('__changed__', [items]);
    };
    
    //INTENT: this remove plays double duty, being used by both nametags and items of nametags
    //both. It is confusing in code here, perhaps, but it results in only a single API - .remove
    //whether a nametag is a list item or not. (thus the test for .itemlist, which tells us if it's an item in a list)
    NametagClass.prototype.remove = function(noNewSelection, erase_unconditionally, uneventfully){
        var self = this;
        
        /* removeAllDescendantListensFrom will return false if the item we pass has a __removing__ method that returns false */
        var result = removeAllDescendantListensFrom(self, erase_unconditionally);
        
        /* if it returned false or we're not giving it a choice, perform list upkeep if it's a listitem, 
           and remove it using jqery, finally sending __changed__ to the list (again only if it's a listitem) */
        if(erase_unconditionally || result !== false){
            //if what we are removing is a list item, perhaps in addition to being a nametag, handled above
            if(self.itemlist && self.itemlist != self){

                //remove the item from selection, if it's selected..
                if(self.selected)
                    self._removeFromSelected();

                var items = [];

                for(var i = 0; i < self.itemlist.items.length ; i ++)
                    if(self.itemlist.items[i] != self)
                        items.push(self.itemlist.items[i]);

                self.itemlist.items = items;
                self.itemlist.renumberItems();
            }   

            //remove the item itself via jquery.
            $(self).remove();

            if(self.itemlist && self.itemlist != self && uneventfully !== true){
                self.itemlist.fire('__subtracted__', [self]);
                self.itemlist.fire('__changed__', [self]);
            }   
        }
    };
    
    /* another for the ease of it - this will call set with the nametag as target, passing on any
       number of values onto the set method, as needed */
    NametagClass.prototype.set = function(attr){
        var args = [this, attr];
        for(var i = 1; i < arguments.length ; i ++)
            args.push(arguments[i]);
            
        set.apply(this, args);
    };
    
    NametagClass.prototype.toggle = function(attr){
        return toggle(this, attr);
    };
    
    /* another for the ease of it - this will call send with the nametag as target, passing on any
       number of values onto the send method, as needed */
    NametagClass.prototype.send = function(attr, value){
        var args = [this, attr];
        for(var i = 1; i < arguments.length ; i ++)
            args.push(arguments[i]);
            
        send.apply(this, args);
    };
    
    NametagClass.prototype.fire = function(attr, value){
        var args = [this, attr];
        for(var i = 1; i < arguments.length ; i ++)
            args.push(arguments[i]);
            
        return fire.apply(this, args);
    };
    
    //there is no 'get'. get is just reading the attribute normal style.
    
    //this just wraps the normal listen that makes passing the fourth argument (an object to bind 
    //listens to) implicitly, using the nametag object as the boundobject, as makes sense [when reloading, to bind it to a nametag].
    //the inclusion of the bound object, and the association of that object with the nametag and listen,
    //was part of solving a very difficult problem of removing event handlers when assocoiated nodes,
    //possibly above the node with the registrations, were deleted. the solution is that when 
    //a node associated with a nametag is reset(), the the registrations of all interior nametags are released.
    //they remove the handlers they have created by having the obj, attr, and method stored when the registration 
    //was made. When reset() occurs, all set/listen events attached to all nametags beneath the reset() call 
    //are unlinked! Too Cool, huh? Took me a full day to solve it after seeing unexplained linear slowdowns on reload().
    NametagClass.prototype.listen = function(obj, attr, method, context){
        /* if it's a fat obj (result of .cd()) */
        if(obj instanceof FATObject)
            fat.listen(obj.path(), attr, method, context ? context : this);
        
        /* it's either an object, */
        else if(obj instanceof Object)
            listen(obj, attr, method, context, this);
            
        /* or it's a string */
        else
            fat.listen(obj, attr, method, context ? context : this);
    };
    
    //immediately evalutate the listened attribute, as well as in the future.
    //some patterns use this, so its here, although i haven't used it yet myself.
    NametagClass.prototype.listenNow = function(obj, attr, method, context){
        /* if it's a fat obj (result of .cd()) */
        if(obj instanceof FATObject)
            fat.listenNow(obj.path(), attr, method, context ? context : this);
        
        /* it's either an object, */
        else if(obj instanceof Object)
            listenNow(obj, attr, method, context, this);
            
        /* or it's a string */
        else
            fat.listenNow(obj, attr, method, context ? context : this);
    };
    
    //INTENT: call reset such that it wont fire erase - just erase it all.
    NametagClass.prototype.forcereset = function(){
        this.reset(true);
    }
    
    //call the actual nametag reset function which was first designed to be on the $ object.
    NametagClass.prototype.reset = function(erase_unconditionally){
        var self = this;
        //and reset ALL registrations that have been paired with this nametag, and all sub nametags!
        var result = removeAllDescendantListensFrom(self, erase_unconditionally, "__reset__");
        
        //and remove all the contents in the jquery way.
        if(result !== false){
            $(self).empty();
            self.set('isReset', true);
        }
    }
    
    //INTENT: make it easy to remove registrations made previously when an item bound with nametag is reset()
    //SUMMARY, YOU MUST use the $(item).reset() or the item.reset() method to remove items with nametag and sub-nametags, lest oddity occur.
    //good news is it looks much simpler when used, just use the .listen method of the nametag associated with activity.
    
    //DETAIL: Since an optional bound object can be paired when making a registration
    //we can then call the _releaseListens() method of the boundobject to release all
    //registration so bound. In this way, registrations that target some scope (nametag) can be delistened
    //smoothly when it or a parent reset(), solving the problem of having an ever growing number of event
    //handlers assigned resulting in a slowdown as they pile up into the hundreds... but this method
    //of binding the registrations to nametags, and then removing registrations when those nametags or a parent
    //nametag reset(), is actually quite easy to use. Just self.listen(obj, attr, func) in almost all
    //cases! :)
    var removeAllDescendantListensFrom = function(target, erase_unconditionally, eventtype){
        //default event type
        if(eventtype === undefined)
            eventtype = "__removing__";

        var all_items = [target]; //the list of all outstanding items to process
        var item; //the current item being processed
        while(item = all_items.shift()){
            
            /* call the given __reset__ or __removing__ method on the first item and return if false  */
            if(!erase_unconditionally && item[eventtype])
                if(fire(item, eventtype, item) === false)
                    return false; 
            
            //add all children to the while loop for NEXT time around.
            var children = $.makeArray(item.childNodes);
            for(var i = 0, node ; (node = children[i]) ; i ++)
                if(node.nodeType == 1)
                    all_items.unshift(node);
    
            if(eventtype == "__removing__" && item.__removed__)
                fire(item, '__removed__', item);

            /* if the item we're traversing (now sure to go away) has a release, or a hitchBinding , release it.  */
            if(item.release)
                item.release();

            //this DOESNT fire if we are resetting at the top level (all deeper are __removing__)
            if(eventtype == '__removing__' && item._hitchBindings && item._hitchBindings.release)
                item._hitchBindings.release();

            //MEMORY MANAGEMENT - we remove references to other dom nodes, etc
            if(eventtype != "__reset__"){
                if(item.__listenedAttributes__)
                    for(var key in item.__listenedAttributes__)
                        item.__listenedAttributes__[key] = null;
                    
                if(item.__attributesListened__)
                    for(var key in item.__attributesListened__)
                        item.__attributesListened__[key] = null;
                    
                //remove anything in data and data itself (which would have self refs if nothing elser)
                if(item.data){
                    for(var key in item.data)
                        item.data = null;
                    item.data = null;
                }
                
                if(item.nametag){
                    var name = item.getAttribute('name');
                    if(name && item.parent && item.parent.children && item.parent.children[name]) 
                        delete item.parent.children[name];
                    
                    //I am going to leave this in. 
                    //I would LOVE to chat about whether this has 
                    //any effect (trying to free 'self' from closures, see
                    //_deleteSelf), it's hard to tell in the debugger if it
                    //does make a difference. perhaps it lets self be collected
                    //quicker? In any case it does not hurt anything until i review
                    //it externally.
                    NametagClass.prototype.mergespace({
                        __deleteSelf__:_deleteSelf
                    }, item, true);
                    
                    item.__deleteSelf__();
                        
                    //remove all pointers to the chain we use to skip around
                    item.parent = item.parentNametag = null;
                    item.scriptroot = item.root = null;
                    item.itemroot = null;

                    //remove all delegate methods
                    for(var key in item)
                        if(key.startsendswith("__"))
                            item[key] = false;
                    
                    item.nametag = null;
                }
            }

            //wheher or not we were first asked to reset or remove we will removing everything non-conditionally 
            //on everything beneath the first node.
            eventtype = "__removing__";
            erase_unconditionally = true;
            item = null;
        }

        return true;
    }
    
    //this is part of the remove system, called to free "self" (make
    //it equal null) via the same closure system the rest of the namespace
    //methods use to get access to self. If i am correct, running this as 
    //part of the teardown will disassociate the element from all the closures.
    var _deleteSelf = function(){
        self = null;
    };
    
    //given an html element (a "node"), find the first parent with an "obj" attribute.
    //in the Nametag architecture, this will always be the script instance parent to 
    //the node passed as being where to start ("here").
    NametagClass.prototype._resolveParentReferences = function(){
        var node = $(this), self = this;
        
        //the three refs we want to find
        var scriptroot, itemroot, parentNametag;
        
        //if we are already a list item, do not find a itemroot. you can think of 
        //it as out of scope - if you wanted the itemroot of an item, you'd say
        //self.itemlist.itemroot.
        if(self.itemlist)
            itemroot = false;

        //go up until we find what we want
        while(node = node.parent()){    
            var currnode = node[0];
            
            //if undefined there were no parents
            if(currnode === undefined || (scriptroot !== undefined && itemroot !== undefined && parentNametag !== undefined))
                return [parentNametag, scriptroot, itemroot];
                
            if(itemroot === undefined && currnode.itemlist)
                itemroot = currnode;
            
            //if this current has nametag, it's a parentNametag, break;
            if(parentNametag === undefined && currnode.nametag)
                parentNametag = node[0];
                
            //which is a element with a .nametag reference
            if(scriptroot === undefined && currnode.nametag){
                //which is the scriptroot if 'script' is defined
                if(currnode.script)
                    scriptroot = currnode;

                //or has a good reference to the closest scriptroot, so why not just return it?
                else if(currnode.scriptroot)
                    scriptroot =  currnode.scriptroot;
            }
        }
    }
    
    //INTENT: I merely run a selector to find a node beneath self with the given name, a very handy and oft-used shortcut.
    NametagClass.prototype.child = function(names, tagtype){
        return $(this).child(names);
    };
    
    //INTENT: I merely run a selector to find a node beneath self with the given name, a very handy and oft-used shortcut.
    NametagClass.prototype.named = function(names){
        return $(this).named(names);
    };
    
    /* use this to make some view come front, making all else go back one.  */
    NametagClass.prototype.sibling = function(names, tagtype){
        return $(this).sibling(names);
    };
    
    //INTENT: I merely run a selector to find a node beneath self with the given name, a very handy and oft-used shortcut.
    NametagClass.prototype.jchild = function(names, tagtype){
        return $(this).jchild(names);
    };
    
    //INTENT: I merely run a selector to find a node beneath self with the given name, a very handy and oft-used shortcut.
    NametagClass.prototype.jnamed = function(names){
        return $(this).jnamed(names);
    };
    
    /* use this to make some view come front, making all else go back one.  */
    NametagClass.prototype.jsibling = function(names, tagtype){
        return $(this).jsibling(names);
    };
    
    //INTENT: find the index of a child in the list
    NametagClass.prototype.indexOf = function(item){
        return this.items.indexOf(item);
    };
    
    //INTENT: I merely run a selector to find a node beneath self with the given name, a very handy and oft-used shortcut.
    NametagClass.prototype.hasChild = function(names, tagtype){
        return $(this).hasChild(names);
    };
    
    //INTENT: I merely run a selector to find a node beneath self with the given name, a very handy and oft-used shortcut.
    NametagClass.prototype.hasNamed = function(names){
        return $(this).hasNamed(names);
    };
    
    /* use this to make some view come front, making all else go back one.  */
    NametagClass.prototype.hasSibling = function(names, tagtype){
        return $(this).hasSibling(names);
    };
    
    //INTENT: given a dictionary, return all children that have values to match all key/attrs in the dict.
    //like findItems({item:'bob'})
    NametagClass.prototype.findItems = function(testdict, oneach, breakOnFirstFlag){
        if(!this.items)
            throw "findItems is being called on a non-list nametag.";
        
        var found_items = [];
        for(var i = 0; i < this.items.length ; i ++){
            
            var found = true;
            for(var key in testdict){
                if(testdict[key] === undefined)
                    continue;
                    
                if(this.items[i].data[key] != testdict[key]){
                    found = false;
                    break;
                }
            }       
            
            /* if found save both the item and the index we found it at for passing to the user-function*/
            if(found){
                found_items.push([this.items[i], i]);
                if(breakOnFirstFlag)
                    break;
            }
                
        }   
        
        /* if they gave us a oneach method, run it on each item with the nametag as scope. */
        if(oneach)
            for(var i = 0; i < found_items.length ; i ++)
                oneach.call(self, found_items[i][0], found_items[i][1]);
        
        /* strip the index back out to return a list of just the found items */
        var output = [];
        for(var i = 0; i < found_items.length ; i ++)
            output.push(found_items[i][0]);
            
        return output;
    }
    
    NametagClass.prototype.findItem = function(testdict, oneach){
        var result = this.findItems(testdict, oneach, true);
        return result.length ? result[0] : false;
    }
    
    //INTENT: return a list of dictionaries stored in this nametag
    NametagClass.prototype.dataFromItems = function(filterkeys){
        var data = [];
       
        if(filterkeys !== undefined)
            filterkeys = stringToList(filterkeys);
        
        var items = this.items;
        
        for(var i = 0; i < items.length; i ++){
            var json_item = copy(items[i].data, {});
            
            if(json_item.self)
                delete json_item.self; /* self is put in, it must be removed */
                
            if(json_item.itemlist)
                delete json_item.itemlist; /* self is put in, it must be removed */
                
            /* if there's a filter  */
            if(filterkeys !== undefined){
                for(var key in json_item)
                    if(filterkeys.indexOf(key) === -1)
                        delete json_item[key];
            }
                
            data.push(json_item);
        }
            
        return data;
    };
    
    //INTENT: return a list of selected dictionaries stored in this nametag
    NametagClass.prototype.dataFromSelected = function(filterkeys){
        var data = [];
        
        filterkeys = stringToList(filterkeys);
        
        var items = this.selectedItems;
        
        for(var i = 0; i < items.length; i ++){
            var json_item = copy(items[i].data, {});
            
            if(json_item.self)
                delete json_item.self; /* self is put in, it must be removed */
                
            if(json_item.itemlist)
                delete json_item.itemlist; /* self is put in, it must be removed */
                
            /* if there's a filter  */
            if(filterkeys !== undefined){
                var to_push = {};
                for(var i = 0; i < filterkeys.length ; i ++)
                    to_push[filterkeys[i]] = json_item[filterkeys[i]];
            }
                
            data.push(json_item);
        }
            
        return data;
    };
    
    //INTENT: renumber the items managed by the nametag, and for efficiency sake,
    //start renumbering at the number passed, to the end, since the operations
    //only displace single items starting at a given point, when they do.
    NametagClass.prototype.renumberItems = function(rangenum){
        
        /* if undefined renumber everything */
        if(rangenum === undefined){
            var start = 0;
            var end = this.items.length-1;
        }
        
        /* if negative renumber from its absolute value to the end of the list */
        else{
            var start = rangenum;
            var end = this.items.length-1;
        }
        
        /* actually do the renumbering */
        for(var i = start; i < end; i ++){
            if(this.items[i] === undefined)
                continue;
            this.items[i].i = i;
            this.items[i].data.i = i;
        }        
    };
    
    //INTENT: create and append a nametag on ourselves, using the given script,
    //using an optional server, and on an optional target, such that calling it
    //with only a script_name creates a script from the global store with
    //this nametags' element as the target.
    NametagClass.prototype.create = function(script_name, data, server, inner_script_flag){
        return create(this, script_name, data, server, inner_script_flag);
    };
    
    //INTENT: This differs from create in that it will treat the given scripttag as 
    //an item of this nametag, with all that it implies for init events, etc.
    NametagClass.prototype.createItem = function(script_name, data, server){
        return createItem(this, script_name, data, server);
    };
    
    //INTENT: This differs from create in that it will treat the given scripttag as 
    //an item of this nametag, with all that it implies for init events, etc.
    NametagClass.prototype.createUnaddedItem = function(script_name, data, server){
        return createItem(this, script_name, data, server, true); /* true supresses adding new item to the self.items array */
    };
    
    //INTENT: return a dict with each key derived from the name of 
    //an input (that has a name) and it's value, for sending back 
    //to the server. 
    NametagClass.prototype.dataFromInputs = function(){
        var self = this;
        var jself = $(self);
        var objs = {};
        
        jself.find('input[type=field]').each(function(){
            if(this['name'])
                objs[this.name] = $(this).val();
        });
        
        jself.find('input[type=password]').each(function(){
            if(this['name'])
                objs[this.name] = $(this).val();
        });
        
        return objs;
    }
    
    //INTENT: on items, this allows the data on the item to automatically mapped onto
    //nodes of matching name, if any. 
    NametagClass.prototype.dataToInputs = function(data){
        var self = this;
        
        if(!data)
            data = self.data;
            
        for(var key in data){
            var items = $(self).find("[name="+key+"]");
            for(var i = 0; i != items.length ; i ++){
                if(items[i].getAttribute("type") == 'field')
                    $(items[i]).val(data[key]);
                else
                    $(items[i]).text(data[key]);
            }
        }
    }
    
    //the items passed in will all acquire a __delete__ attribute in their .data dict,
    //which, if honored by the backend, will cause the item to be deleted on sync.
    NametagClass.prototype.markItemsForDelete = function(items){
        for(var i = 0 ; i < items.length ; i ++)
            items[i].data.__delete__ = true;
        return items;
    }
    
    //Loop through the children, securemethod any that don't match the filter criteria. (all nodes are always inited, just hidden on no-match)
    //this is bound to the 'filter' attribute. setting that on this nametag (to none or to a function meant to evaluate) causes this run.
    NametagClass.prototype._evaluateFilter = function(){
        var self = this;
        
        //if filter is an empty string or false or undefined, accept all.
        if(!self.__filter__)
            self.__filter__ = function(x){return true};
        
        //cycle through children, marking things that don't pass the filter as hidden or vice versa.    
        for(var i = 0; i < self.items.length ; i ++){
            if(!self.__filter__(self.items[i])){
                if(self.items[i].selected) 
                    self.items[i].unselect();
                $(self.items[i]).addClass('hidden');
            }else{
                $(self.items[i]).removeClass('hidden');        
            }
        }       
    }
    
//////////////////////////////////////////////////////////////////////////////
//Behaviors that are applied in layers to the list to accenutate it;
//these will be put in seperate files shortly.
//////////////////////////////////////////////////////////////////////////////

//////////////////////////////////////////////////////////////////////////////
//mixin methods that manage, save/send, reorganize, etc items in a Nametag.
//////////////////////////////////////////////////////////////////////////////

    /* readable shortcut for calling addItems without calling any events */
    NametagClass.prototype.addItemsUneventfully = function(initial_values){
        this.addItems(initial_values, true);
    };
    
    /* this will ensure anything passed as fodder for a list conforms i.e. nothing to object
       non-object to object, object to list, such that, when done, all entries are objects
       in a list (note a non object 'val' is turned into {item:val} for processing)*/
    NametagClass.prototype.prepareListItems = function(initial_values){
        /* if no initial values we give a list with a single empty dict */
        if(initial_values===undefined)
            initial_values = [{}];
            
        /* if they pass a single item, promote it to a list */
        else if(!(initial_values instanceof Array))
            initial_values = [initial_values];
        else
            initial_values = copy(initial_values);
            
        /* this will cast non objects into a standard item:val format,
           or turn a sequence of list items into their .data items.. */
        for(var i = 0; i < initial_values.length ; i ++){
            if(initial_values[i].itemlist)
                initial_values[i] = initial_values[i].data;
            else if(!(initial_values[i] instanceof Object))
                initial_values[i] = {item:initial_values[i]};
        }
        
        return initial_values;
    }
    
    //INTENT: add a new child to a list
    //add a new obj to the list. If no url is given, create an obj using the initial_values
    //if a url IS given, then send the initial_values to the server and use the results to make 
    //the new obj. That is why there are two patterns in the add method.
    //note a cool side effect of sending to the server first is having the DB id of a new obj when it's made.
    NametagClass.prototype.addItems = function(initial_values, uneventfully){
        var self = this;
        var new_item;
        
        var output_items = [];
        
        initial_values = self.prepareListItems(initial_values);
            
        for(var i = 0; i < initial_values.length ; i ++){
          
            //apply defaults to object!
            var new_obj = {i:self.items.length}; 

            var data_from_entry = initial_values[i];
            copy(data_from_entry, new_obj);

            if(self.__preloadingitem__)
                new_obj = self.__preloadingitem__(new_obj) || new_obj;

            if(self.__loadingitem__)
                new_obj = self.__loadingitem__(new_obj) || new_obj;
                
            //make the new obj usin the obj given
            try{
                var new_item = createJQueryTemplateUsingNametag_andData_at(self, new_obj, self)[0];
                if(!new_item)
                    var msg = "No script or anonymous script provided when loading a script from URL, at: "+$("<div></div>").append(self).html();

            }catch(e){
                throw "error in script: "+e+' in '+self.script+"\n\n(not having a script defined can cause this too)";
            }
            
            output_items.push(new_item);
            self._initItem(new_item, new_obj);

            //after adding something to the bottom, show the bottom of the list 
            if(self['selectable'] && self['selectnew']){
                self.items[self.items.length-1].setSelection();
                $(self['container']).scrollToBottom();
            }
        }

        /* we only call changed once no matter how many added! */
        if(uneventfully !== true){
            self.fire('__added__', output_items);
            self.fire('__changed__', output_items);
        }
        
        /* if it's one item, return the item. otherwise return a list of the items. */
        /* Nametag.Runtime.ExpandNametags(self); */
        return output_items.length > 1 ? output_items : output_items[0];
    };
    
    /* a convienence to add only items that are not already in the list */
    NametagClass.prototype.addItemsUniquely = function(initial_values, uneventfully){
        var self = this;
        initial_values = self.prepareListItems(initial_values);
        
        var deduplicated_items_to_make = [];
        
        for(var i = 0; i < initial_values.length ; i ++){    
            /* use the items' .data if we are passed elements */
            var item = initial_values[i].ELEMENT_NODE ? initial_values[i].data : initial_values[i];
            var compare_item = deepcopy(item);
            
            /* only compare NON-object items for equality */
            for(var key in compare_item)
                if(compare_item[key] instanceof Object)
                    delete compare_item[key];

            /* (and skip 'i' too) */
            if(compare_item.i !== undefined)
                delete compare_item.i;
            
            if(!self.findItem(compare_item))
                deduplicated_items_to_make.push(item);
        }
            
        return self.addItems(deduplicated_items_to_make, uneventfully);
    }
    
    //INTENT: insert a new child to a list
    //Dervived from .addItems
    NametagClass.prototype.prependItems = function(initial_values, uneventfully){
        var self = this;
        var new_item;
        
        var output_items = [];
        
        initial_values = self.prepareListItems(initial_values);
            
        for(var i = 0; i < initial_values.length ; i ++){
         
            //apply defaults to object!
            var new_obj = {i:self.items.length}; 

            var data_from_entry = initial_values[i];
            copy(data_from_entry, new_obj);
            
            if(self._use_shadow_items && self.items[0] && self.items[0].ELEMENT_NODE === undefined){
                var new_item = {
                    data:new_obj,
                    selected:false
                };
            }
            
            else{
                if(self.__preloadingitem__)
                    new_obj = self.__preloadingitem__(new_obj) || new_obj;

                if(self.__loadingitem__)
                    new_obj = self.__loadingitem__(new_obj) || new_obj;
                    
                //make the new obj usin the obj given
                try{
                    var new_item = createJQueryTemplateUsingNametag_andData_at(self, new_obj, self, false)[0];
                    if(!new_item)
                        var msg = "No script or anonymous script provided when loading a script from URL, at: "+$("<div></div>").append(self).html();

                }catch(e){
                    throw "error in script: "+e+' in '+self.script+"\n\n(not having a script defined can cause this too)";
                }                        
            }
            
            self.items.insert(new_item, 0);
            self._initItem(new_item, new_obj, true); //dont add to children
            output_items.push(new_item);
        }
        
        /* we only call changed once no matter how many added! */
        if(uneventfully !== true){
            self.fire('__added__', output_items);
            self.fire('__changed__', output_items);
        }
        
        /* if it's one item, return the item. otherwise return a list of the items. */
        /* Nametag.Runtime.ExpandNametags(self); */
        return output_items.length > 1 ? output_items : output_items[0];
    };
    
    /* a convienence to add only items that are not already in the list */
    NametagClass.prototype.prependItemsUniquely = function(initial_values, uneventfully){
        var self = this;
        initial_values = self.prepareListItems(initial_values);
        
        var deduplicated_items_to_make = [];
        
        for(var i = 0; i < initial_values.length ; i ++){    
            /* use the items' .data if we are passed elements */
            var item = initial_values[i].ELEMENT_NODE ? initial_values[i].data : initial_values[i];
            var compare_item = deepcopy(item);
            
            /* only compare NON-object items for equality */
            for(var key in compare_item)
                if(compare_item[key] instanceof Object)
                    delete compare_item[key];

            /* (and skip 'i' too) */
            if(compare_item.i !== undefined)
                delete compare_item.i;
            
            if(!self.findItem(compare_item))
                deduplicated_items_to_make.push(item);
        }
            
        return self.prependItems(deduplicated_items_to_make, uneventfully);
    }
        
    /* make a place for methods applied to items with the data api */
    Nametag.Methods.Data = {};
    
    //INTENT: given a key name, repaint the list with the itens sorted by that key.
    Nametag.Methods.Data.sortBy = function(key, direction){
        //do what it takes to reset the nametag for redrawing
        if(self.selectable && self.selectedItems.length)
            self.unselectAll();
            
        //If and ONLY if we are not already reset, i.e. if we have been made and 
        //are not already reset, then reset ourselves unconditionally (1starg=true)
        //ignoring __removing__ and __erase__ stanzas, since reload is yet a third logical
        //pattern by being more of a update-in-place operation then a detruction...
        if(self.initialized  && !self.isReset)
            self.reset(true);
        
        //mark we are now dirty
        self.set('isReset', false);
            
        //since we are making all our child items from scratch, set this to a new array
        self.items = new Array;

        var sortedFields = new Array;
        
        if(direction)
            this._sort_direction = direction;
        
        for(var i = 0; i < this.items.length; i ++)
            sortedFields.push( [this.items[i].data[key], this.items[i].data] );
            
        sortedFields.sort();
        
        //if "true" sort most to least, false least to most.
        if(!this._sort_direction)
            sortedFields.reverse();
            
        //strip out the objects in the sorted array (index 1) to reload the list with 
        var newObjs = new Array;
        for(var i = 0; i < sortedFields.length; i ++)
            newObjs.push(sortedFields[i][1]);
        
        //this is what actually re-lays out the list.
        this._createItemsFromObjs(newObjs);
        
        //do the opposite in the next call (toggle)
        this._sort_direction = !this._sort_direction;
    };
    
    //INTENT: the remove method for an item is literally the same as for a nametag element -- the .remove function tests for type automatically,
    //since in the case that an item is also a nametag, both procedures need to be performed...
    Nametag.Methods.Data.remove = NametagClass.prototype.remove;
    Nametag.Methods.Data.forceremove = NametagClass.prototype.forceremove;

    /* INTENT: this is differnt from insertItems or addItems in that it 
       does NOT make a new item, via passed data, for insertion. This 
       requires the items and target be on the  */
    NametagClass.prototype.moveItems = function(items, child){
        var self = this;
        
        if(!(items instanceof Array))
            items = [items];
        
        /* what to do if we are NOT dropping on last child */
        if(child && child != self.items[self.items.length-1]){
            /* changing dom - children must be unique, so 
               the browser handles moving the item (reordering)
               it. */
               
            for(var i = 0; i != items.length ; i ++)
                self.insertBefore(items[i], child);
                
            /* if we are a list-type nametag, also mange the items list.  */
            if(self.list){
                /* remove all the items from self.items */
                for(var i = 0; i != items.length ; i ++){
                    self.items.remove(self.items.indexOf(items[i]));  
                       
                    self.items.insert(
                        items[i], 
                        Math.min(self.items.indexOf(child), self.items.length-1)
                    );
                }
            }
        }
        
        /* what to do if we are dropping on last child */
        else{
            /* changing dom - children must be unique, so 
               the browser handles moving the item (reordering)
               it. */
            for(var i = 0; i != items.length ; i ++)
                self.appendChild(items[i]);
            
            /* if we are a list-type nametag, also mange the items list.  */
            if(self.list){
                /* remove all the items from self.items */
                for(var i = 0; i != items.length ; i ++){
                    self.items.remove(self.items.indexOf(items[i]));
                    self.items.push(items[i]);
                }   
            }
        }
        
        /* renumber the items, now that we've moved them. */
        self.renumberItems();
        
        /* deal with selecting the moved items if we are selectable */
        if(self.selectable){
            /* set selection on item dropped, if only one is dragged,  */
            if(items.length == 1)
                items[0].setSelection();

            /* otherwise do not cause selection, but cause all dragged to 
               be selected. */
            else{
                self.unselectAll();
                for(var i = 0; i != items.length ; i ++)
                    items[i].select();
            } 
        }
        
        self.fire('__changed__');
    }
    
    /* readable shortcut for calling addItems without calling any events */
    Nametag.Methods.Data.insertItemsUneventfully = function(initial_values, elem){
        return this.insertItems(initial_values, elem, true);
    };
    
    //INTENT: I insert a new item using an obj or objs, before the given item.
    //PLEASE NOTE this is overloaded. It is used both for inserting AND refreshing!
    NametagClass.prototype.insertItems = function(objs, elem, uneventfully){
        var output_items = [];
        var self = this;
        
        var firstidx = self.items.indexOf(elem);
        
        objs = self.prepareListItems(objs);
            
        for(var i = 0; i < objs.length ; i ++){
            //if there was a selection, save what it was before deselecting all.
            var were_selected = self.selectedItems;
            self.unselectAll();

            //apply defaults to object!
            var idx = firstidx+i;
            var new_obj = {i:idx};

            //merge in the obj passed onto the new obj
            copy(objs[i], new_obj);
            
            if(self.__preloadingitem__)
                new_obj = self.__preloadingitem__(new_obj) || new_obj;

            if(self.__loadingitem__)
                new_obj = self.__loadingitem__(new_obj) || new_obj;
            
            //make the new obj usin the obj given
            try{
                var new_item = createJQueryTemplateUsingNametag_andData_at(self, new_obj, elem, true)[0];    
                if(!new_item)
                    throw "No script or anonymous script provided when inserting a script at: "+$("<div></div>").append(self).html();
                    

            }catch(e){
                throw "error in __script__: "+e+' in '+self.script+"\n\n(not having a script defined can cause this too)";
            }
                
            output_items.push(new_item);
            self._initItem(new_item, new_obj, true); //true means don't add to .items when preparing
            self.items.insert(new_item, firstidx+i);
        }
        
        /* rebuild child list. apparently insert did not work, above. to be revisited. */
        //self.items = $.makeArray($(self).children());
        
        /* renumber items */
        self.renumberItems(firstidx);
        
        /* send a change event once for all items inserted  */
        
        if(uneventfully !== true){
            self.fire('__added__', output_items);
            self.fire('__changed__');
        }
        
        /* if it's one item, return the item. otherwise return a list of the items. */
        return output_items.length > 1 ? output_items : output_items[0];
    }

    //INTENT: I will sync the obj paired to an item - and I will recreate the script with the new
    //value, "refreshing" it.
    Nametag.Methods.Data.refresh = function(data){
        
        if(this._undergoingRefresh)
            return false;
            
        this._undergoingRefresh = true;
        
        /* if reloading is defined, we can call it to get a new data or modify the existing reference */
        data = fire(this, '__reloading__', data) || data;
        
        if(data !== undefined)
            copy(data, this.data);
        
        //if there was a selection, save what it was before deselecting all.
        var was_selection = this.itemlist.selection == this;
        var was_selected = this.selected ? true : false;
        
        //if it was selected, remove it from the selected items knowing the 
        //new one will take it's place, below.
        if(was_selected)
            this._removeFromSelected();
                
        //this method of updating destroys then re-adds the item in the same spot, resetting selection on the item if 
        //it was previously selected.
        
        //apply defaults to object!
        var idx = this.itemlist.items.indexOf(this);
        var new_obj = {i:idx};   
            
        copy(this.data, new_obj);
        
        if(!this.ELEMENT_NODE){
            var new_item = {
                data:new_obj,
                selected:this.selected
            };
        }
        
        else{
            if(this.__preloadingitem__)
                new_obj = this.__preloadingitem__(new_obj) || new_obj;

            if(this.__loadingitem__)
                new_obj = this.__loadingitem__(new_obj) || new_obj;
                
            //make the new obj usin the obj given
            try{
                var new_item = createJQueryTemplateUsingNametag_andData_at(this.itemlist, new_obj, this, true)[0];    
                if(!new_item)
                    throw "No script or anonymous script provided when inserting a script at: "+$("<div></div>").append(this.itemlist).html();
            }catch(e){
                throw "error in __script__: "+e+' in '+self.script+"\n\n(not having a script defined can cause this too)";
            }       
            
            removeAllDescendantListensFrom(this, true);
            $(this).remove();            
        }
        
        this.itemlist.items[idx] = this.itemlist._initItem(new_item, new_obj, true); //true means don't add to .items when preparing 
        
        if(was_selection)
            new_item.setSelection();
        else if(was_selected)
            new_item.select();
            
        //a refresh indicates a change
        this.itemlist.fire('__changed__', [new_item]);
        
        this._undergoingRefresh = false;
        
        return new_item;         
    }
    
    //INTENT: empty obj then the obj will be deleted; this is how the server can delete things.
    Nametag.Methods.Data.sync = function(url){
        var self = this;
        
        url = url == undefined ? self.itemlist['syncurl'] : url;
        url = url == undefined ? self.itemlist['list'] : url;

        //send obj to server (as a list with one item); 
        //if the entry is blank (no keys) remove it delete it, false skip, else refresh
        post({
            url:url,
            data:[self.data],
            success:function(objs){
                if(objs[0] !== false){
                    
                    getkeys(objs[0]).length == 0 ? 
                        self.remove() :
                        self.refresh(objs[0]);
                        
                    self.itemlist.fire('__changed__', [self]);
                }
            }
        });
    }
    
    /* this will be applied per-item, and make that item select itself if
       hovered over while dragging */
    NametagClass.prototype._hoverselectable = function(item){    
        var self = this;
        
        var tagspace = {
            __hoverover__:function(item, e){
                self._waitingForHoverSelectable = true;
                
                if(Nametag.Dragging.isDragging && !self.doubleTriggerGuard){
                    self.doubleTriggerGuard = true;
                    
                    setTimeout(function(){
                        if(self._waitingForHoverSelectable && Nametag.Dragging.isDragging)
                            item.setSelection();
                        self.doubleTriggerGuard = false;
                    }, Nametag.Runtime.dragdelay*2);
                    
                }
            },
            __hoverout__:function(item, e){
                self._waitingForHoverSelectable = false;
            }
        };
        
        self.mergespace(tagspace);
    };
    
    /* THIS is a sister method to _hoverselectable, but designed to be applied
       to non-nametags, like button inputs. So instead of hard coding 
       a search and apply in the nametag initialization loop, i chose to abstract
       it, and thus CSSTraits were born! in this case, all widgets with class "button"
       will have this method (and any number of others, thanks to chaining/mergespace/forcechain)
       run precisely once, for every button interior to any nametag, using efficient
       css-selector search. I could see this becoming a burden if too many were applied, but 
       it does present a useful means to coordinate system-wide actvities like hover selection,
       perfectly.  */
    var makeHoverSelectable = function(what, onhover){
        var self = what;
        
        $(self).hover(function(e){
            self._waitingForHoverSelectable = true;
            
            if(Nametag.Dragging.isDragging && !self.doubleTriggerGuard){
                self.doubleTriggerGuard = true;
                
                setTimeout(function(){
                    if(self._waitingForHoverSelectable && Nametag.Dragging.isDragging)
                        onhover ? 
                            onhover.call(self, self, e) : 
                            $(self).trigger('click');
                    self.doubleTriggerGuard = false;
                }, Nametag.Runtime.dragdelay*2);
                
                return false;
            } 
        }, function(){
            self._waitingForHoverSelectable = false;
            return false;
        });
    };
    
    /* this will be applied per-item, and make that item select itself if
       hovered over while dragging */
    NametagClass.prototype._dragselectable = function(item){    
        var self = this;
        
        var tagspace = {
            __hoverout__:function(item, e){
                if(!Nametag.Dragging.isDragging && isAltPressed && !isShiftPressed){
                    if(!item.selected)
                        item.select();
                    else
                        item.unselect();
                }
            }
        };
        
        self.mergespace(tagspace);
    };
    
    /* this is just a set of methods applied to a nametag if it's a list,
       selectable, and they haven't set keyselectable to false specifically. */
    NametagClass.prototype._keyselectable = function(){
        var self = this;
        
        var tagspace = {};
        
        //select all and none only work if not multiselectable
        if(self.multiselectable){
            tagspace['__keypress__'] = function(e){
                if(isAltPressed){
                    if(e.keyCode == 65){
                        self.selectAll();
                        return false;
                    }

                    else if(e.keyCode == 85){
                        self.unselectAll();
                        return false;
                    }
                }else{
                    return true;
                }
            };
        }
        
        tagspace['__selection__'] = function(){
            Nametag.GUI.focus.setFocused(self);
        };
        
        tagspace['__selected__'] = function(){
            if(self.selectedItems.length !== 1)
                Nametag.GUI.focus.setFocused(self);
        };
        
        if(self.keyremovable)
            tagspace['__backspace__'] = function(){
                /* if there are selected items, or if they aksed for key remove confirmed, only if alt pressed */
                if(self.selectedItems.length && (!self.keyremovableconfirm || isAltPressed)){
                    var items = self.selectedItems.copy();
                    var idx = self.items.indexOf(self.selectedItems.last());
                    for(var i = 0; i != items.length; i ++)
                        items[i].remove();

                    if(self.items[idx])
                        self.items[idx].setSelection();
                    else if(self.items[idx-1])
                        self.items[idx-1].setSelection();
                    else if(self.items[idx+1])
                        self.items[idx+1].setSelection();
                    else if(self.items[0])
                        self.items[0].setSelection();
                }
            }
        
        /* IF we are linearselectable (def. true), we will use the arrow keys to go up/down */
        if(self.linearselectable){
            /* when up arrow pressed select one less then current or last */
            var uparrow_function = function(){
                if(self.items.length !== 0){
                    if(isShiftPressed)
                        self.items[0].setSelection();

                    else if(!self.selection && self.loopscrollable)
                        self.items.last().setSelection();
                        
                    else{
                        var idx = self.items.indexOf(self.selection);
                        
                        if(self.items[idx-1])
                            self.items[idx-1].setSelection();
                        else if(self.loopscrollable)
                            self.items[self.items.length-1].setSelection();
                        else
                            self.fire("__scrollbegin__");
                    }
                }  
            };
            
            /* when down arrow pressed select one more then current or first */
            var downarrow_function = function(){
                if(self.items.length !== 0){
                    if(isShiftPressed)
                        self.items.last().setSelection();

                    else if(!self.selection && self.loopscrollable)
                        self.items[0].setSelection();
                        
                    else{
                        var idx = self.items.indexOf(self.selection);   
                        var next_item = self.items[idx+1];
                            
                        if(next_item)
                            self.items[idx+1].setSelection();
                        
                        else if(self.loopscrollable)
                            self.items[0].setSelection();
                            
                        else
                            self.fire("__scrollend__");
                    }    
                }
            };
            
            /* if reversearrowkeys is false, hook it up normal */
            if(!self.reversearrowkeys){
                if(self.verticalarrowkeys){
                    tagspace['__uparrow__'] = uparrow_function;
                    tagspace['__downarrow__'] = downarrow_function;
                }
                
                if(self.horizontalarrowkeys){
                    tagspace['__leftarrow__'] = uparrow_function;
                    tagspace['__rightarrow__'] = downarrow_function;
                }  
            }
            
            /* otherwise hook it up reversed */
            else{
                if(self.verticalarrowkeys){
                    tagspace['__uparrow__'] = downarrow_function;
                    tagspace['__downarrow__'] = uparrow_function;
                }
                
                if(self.horizontalarrowkeys){
                    tagspace['__rightarrow__'] = uparrow_function;
                    tagspace['__leftarrow__'] = downarrow_function;
                }
            }
        }
        
        /* merge the methods into the nametag without destroying methods already there (chaining) */
        self.mergespace(tagspace);
    };

//////////////////////////////////////////////////////////////////////////////
//mixin methods that manage selection
//////////////////////////////////////////////////////////////////////////////
    
    //INTENT: methods to add on an item to let it manage selection
    NametagClass.prototype._selectableItem = function(item){
        var jitem = $(item);
        
        var list = item.itemlist;
        
        if(item.selected === undefined)
           item.selected = false; 
            
        //INTENT: IMPORTANT: apply methods for list item to our item, to form it's api        
        var SelectingMethods = Nametag.Methods.Selecting;
        for(var key in SelectingMethods)
            item[key] = SelectingMethods[key];
            
        if(list.mouseselectable){
            //basic hover selection, disabled if selectable[0] is false
            if(list.selectable[0]){
                jitem.hover(
                    function(e){
                        var list = this.itemlist;
                        var jitem = $(this);
                        
                        list.fire('__hoverover__', this, e) !== false;
                        
                        /* do not do hover effect if we are dragging or shift is down (i.e. artifacts whilst dragging/moving windows) */
                        if(Nametag.Dragging.state == "dragging" || e.shiftKey)
                            return;
                            
                        /* comment */
                        if(!this.selected || list.reselectable){
                            list.selectable[2] && jitem.removeClass(list.selectable[2]);
                            jitem.removeClass(list.selectable[1]);
                            jitem.addClass(list.selectable[0]);
                        }
                    }, 
                    
                    function(e){                        
                        var list = this.itemlist;
                        var jitem = $(this);
                        
                        list.fire('__hoverout__', this, e) !== false;
                        
                        jitem.removeClass(list.selectable[0]);
                        
                        if(this.selected)
                            list.selectable[1] && jitem.addClass(list.selectable[1]);
                        else
                            list.selectable[2] && jitem.addClass(list.selectable[2]);
                    } 
                );
            }

            //only if we are not drag, do we make our items clickable/double clickable; 
            //otherwise drag has done it for us (and calls __clickitem__ correctly) as needed.
            //if(!list.drag)
            jitem.singleclick(list._nametagClick, list._nametagDblclick);

            ////if a double click is received, interpret it as desire to setSelection, as well
            ////as run double click handler
            //jitem.dblclick(list._nametagDblclick);
        }
    }

    //INTENT: This will unselect all items. 
    //NOTE that unselecting an item removes
    //it from the .selected array, so we don't want to call unselect()
    //in the loop, or we'll alter the loop we're looping in!
    NametagClass.prototype.unselectAll = function(unsetselection_flag){         
        var items_selected = copy(this.selectedItems);
        
        var obj;
        while((obj = this.selectedItems.pop()))
            obj._toggleSelected(false, false);
        
        for(var i = 0; i < items_selected.length ; i ++)
            fire(this, "__unselected__", items_selected[i]);
        
        this._sendSelectionEventIfSingleElementSelected(undefined, unsetselection_flag);
    };
    
    //INTENT: select all the items on this nametag (of list type)
    NametagClass.prototype.selectAll = function(){         
        /* we must unselect all first, before selecting again, 
           to be semantically valid, i.e. we are actually unselecting 
           and reselecting everything, not just selecting everything: */
        this.unselectAll();
        
        /* for each item we have, toggle its selection to true and 
           add the item to the selected list */
        for(var i = 0; i < this.items.length; i ++){
            this.items[i]._toggleSelected(true, false);
            this.items[i]._addItemToSelected();
        }
        
        /* if there is a __selected__ handler, fire it for each addition. 
           __selected__ is also fired on the item, by  */
        if(this.__selected__)
            for(var i = 0 ; i < this.selectedItems.length ; i ++){
                /* selecting and selected merely provide casuality. */
                fire(this, "__selecting__", this.selectedItems[i]);
                fire(this, "__selected__", this.selectedItems[i]);
            }
        
        this._sendSelectionEventIfSingleElementSelected();                 
    };
    
    /* THIS one is on a nametag - there is another on an item. You must pass a dict to match against when calling 
       on a nametag, obviously not if you call it directly on the item */
    /* cause the item matching the dictionary given to get selection */
    NametagClass.prototype.selectItems = function(dict){
        return this.findItems(dict, function(item){
            item.select();
        });
    };
    
    NametagClass.prototype.setSelectionFor = function(dict){
        return this.findItem(dict, function(item){
            item.setSelection();
        });
    };
    
    
    /* a container class for all methods dealing with selection, which will be merged into self
       as required */
    Nametag.Methods.Selecting = {
        isSelectable:true
    };
    
    /* INTENT: unselect the item, fire the selection event (on nothing of course) */
    Nametag.Methods.Selecting.getData = function(){
        var self = this;
        var data = copy(self.data);
        delete data.i;
        delete data.self;
        return data;
    };
    
    /* INTENT: select the item, fire the selection event */
    Nametag.Methods.Selecting.select = function(unsetselection_flag){
        if(this.isSelectable){
            
            if(this.itemlist.multiselectable === false)
                this.itemlist.unselectAll();

            this._addItemToSelected();
            this._toggleSelected(true, undefined, unsetselection_flag);

            /* selecting and selected merely provide casuality. */
            fire(this.itemlist, "__selecting__", this);
            fire(this.itemlist, "__selected__", this);
        }  
    };
    
    /* INTENT: unselect the item, fire the selection event (on nothing of course) */
    Nametag.Methods.Selecting.unselect = function(){
        if(this.isSelectable){
            if(this.selected){
                this._removeFromSelected();
                this._toggleSelected(false);
                fire(this.itemlist, "__unselected__", this);
            }
        }
    };
    
    
    /* logically toggle the state of the item (_toggleSelected does this graphically as needed) */
    Nametag.Methods.Selecting.toggleSelected = function(){
        this.selected ? this.unselect() : this.select();
    };
    
    /* INTENT: cause only one element to be selected (and fires selection therefore) */
    /* the two falses in unselectAll() and select() here are the ENTIRE reason 
       we have the 'unsetselection_flag' at all - it allows setSelection, IF unsetselection is
       false on the nametag, to skip sending the unselection event when changing from one selection
       to another. this can be more efficient for patterns that reload-using-selection, where it would
       serve no purpose in calling __unselection__ between any two consecutive selection events */
    Nametag.Methods.Selecting.setSelection = function(dict){
        if(this.isSelectable){
            this.itemlist.unselectAll(false);
            this.select(false);
        }
    };
    
    //INTENT: this selects an item, but does so without firing a selection event. i.e. NO set() calls
    Nametag.Methods.Selecting.uneventfulSelect = function(){
        if(this.isSelectable){
            this.selected = true;
            this._addItemToSelected();

            if(this.itemlist.selectedItems.length == 1){
                this.itemlist.selectionindex = this.itemlist.indexOf(this);
                this.itemlist.selection = this;
            }else{
                this.itemlist.selectionindex = -1;
                this.itemlist.selection = false;
            }

            if(this.ELEMENT_NODE !== undefined){
                var jitem = $(this);

                if(this.itemlist.selectable[2])
                    jitem.removeClass(this.itemlist.selectable[2]);

                jitem.addClass(this.itemlist.selectable[1]);
            }
        }
    };
    
    //INTENT: this selects an item, but does so without firing a selection event. i.e. NO set() calls
    Nametag.Methods.Selecting.uneventfulSelection = function(){
        if(this.isSelectable){
            if(this.itemlist.selection && this.itemlist.selection.ELEMENT_NODE !== undefined){
                var selection = this.itemlist.selection;
                var jselection = $(this.itemlist.selection);

                if(this.itemlist.selectable[2])
                    jselection.removeClass(this.itemlist.selectable[2]);

                jselection.addClass(this.itemlist.selectable[1]);
            }   

            this.itemlist.unselectAll();
            this.selected = true;
            this._addItemToSelected();

            this.itemlist.selectionindex = this.itemlist.indexOf(this);
            this.itemlist.selection = this;

            if(this.ELEMENT_NODE !== undefined){
                var jitem = $(this);
                
                if(this.itemlist.selectable[2])
                    jitem.removeClass(this.itemlist.selectable[2]);
                    
                jitem.addClass(this.itemlist.selectable[1]);
            }   
        }
    };
    
    Nametag.Methods.Selecting._sortItemsByKey = function(items, key, direction){
        var to_sort = [];
        for(var i = 0; i < items.length ; i ++)
            to_sort.push([items[i][key], items[i]]);
        
        to_sort.sort();
        
        var output = [];
        for(var i = 0; i < to_sort.length ; i ++)
            output.push(to_sort[i][1]);
            
        if(direction)
            output.reverse();
        
        return output;
    };
    
    Nametag.Methods.Selecting._sortSelectedByIndex = function(a, b){
        return a.itemlist.indexOf(a) > b.itemlist.indexOf(b);
    };
    
    //INTENT: add item to the selectedItems collection data-wise, not ui
    Nametag.Methods.Selecting._addItemToSelected = function(){
        if(this.itemlist.selectedItems.indexOf(this) === -1)
            this.itemlist.selectedItems.push(this);
    };
    
    //INTENT: remove an item to the selected collection data-wise, not ui
    Nametag.Methods.Selecting._removeFromSelected = function(){
        var idx = this.itemlist.selectedItems.indexOf(this);
        this.itemlist.selectedItems.remove(idx);
        this.itemlist._sendSelectionEventIfSingleElementSelected();
    };
    
    //INTENT: grapgically toggle the state of selection (pass true or false or none to toggle), along
    //with evaluating selection status as things are selected/unselected.
    Nametag.Methods.Selecting._toggleSelected = function(to, supress_selection_events, unsetselection_flag){
        /* apply the requested select state or flip it */
        this.selected = to !== undefined ? to : !this.selected;
        
        var jitem = $(this);
        
        if(this.ELEMENT_NODE !== undefined){
            /* depending on the presence of the setting, change the css */
            if(this.itemlist.selectable[1]){
                if(this.selected){
                    this.itemlist.selectable[2] && jitem.removeClass(this.itemlist.selectable[2]);
                    jitem.removeClass(this.itemlist.selectable[0]);
                    jitem.addClass(this.itemlist.selectable[1]);
                }
                else{
                    jitem.removeClass(this.itemlist.selectable[1]);
                    this.itemlist.selectable[2] && jitem.addClass(this.itemlist.selectable[2]);    
                }          
            }
            
            this.itemlist._sendSelectionEventIfSingleElementSelected(undefined, unsetselection_flag);
        }  
    };
    
    //evaluate list of selected and make item selection if one becomes selected.
    //issue unselection on the reverse condition, two getting selected.
    NametagClass.prototype._sendSelectionEventIfSingleElementSelected = function(event, unsetselection_flag){            
        /* if there is 1 selected item */
        if(this.selectedItems.length == 1){
            /* the only diff. between preselection and selection, as is the 
               case with selecting and selected, is that one happens before
               the other.  */
               
            var lastselection = this.selection;

            set(this, "selectionindex", this.indexOf(this.selectedItems[0]));
            set(this, "selection", this.selectedItems[0]);
            
            fire(this, '__preselection__', this.selectedItems[0], event, lastselection);
            fire(this, '__selection__', this.selectedItems[0], event, lastselection);  
        }
        
        /* if there is not one selected item AND we have selection */
        else if(this.selection){
            set(this, "selectionindex", -1);
            this.unselection = this.selection;
            this.selection = false;
            
            /* if unsetselection is false and we are being called during an setSelection event, dont fire unselection. */
            if(this.unsetselection === false && unsetselection_flag === false)
                return;
                
            fire(this, '__unselection__', this.unselection, event);  
        }
    };
    
    Nametag.Methods.Clicking = {};
    
    //note this is a function called explicitly (it used to be a listen on send)
    //because we'd like __clickitem__ handlers to always run AFTER this, and before (of
    //course, since it used the event itself) that was not certain.
    Nametag.Methods.Clicking._selectable_click_handler = function(what){
        var list = what.itemlist;
        
        if(!what || !list.mouseselectable)
            return true;
        
        /* if alt is down, toggle selection */
        if(isAltPressed && list.multiselectable !== false){
            if(list.unselectable){
                what.toggleSelected();
                list._sendSelectionEventIfSingleElementSelected();
            }
        }

        else if(isAltPressed && list.multiselectable == false){
            if(list.unselectable)
                what.unselect();
        }

        /* THIS performs selecting a range on a multiselectable list */
        else if(isShiftPressed && list.multiselectable && list.linearselectable){
            /* start evaluating where we clicked */
            var i = list.items.indexOf(what);   

            /* put all items to select here. we want to select them
               from first to last, althogh we find them last to first. */
            var to_select = [];

            /* go backward accumulatng indexes to select until we reach
               the first selected item, or the beginning of the list.  */
            while(i >= 0 && list.items[i].selected !== true){
                to_select.push(i);
                -- i;
            }

            /* the reversal means we'll select it in the natural order. */
            to_select.reverse();

            /* select all the new items between 'what' and the first previously selected item */
            for(var i = 0; i < to_select.length ; i ++)
                if(!list.items[to_select[i]].selected)
                    list.items[to_select[i]].select();
        }
        
        /* finally if it's selected and toggleselect is true, unselect it, to support that option */
        else if(list.toggleselect)
            what.toggleSelected();

        /* else it's not selected and set selection on it. */
        else if(!what.selected || list.multiclickable === false || list.reselectable)
            what.setSelection();
        
        else if(list.keyselectable)
            Nametag.GUI.focus.setFocused(list);
    };
    
    //if alt is pressed, multiselectable it. otherwise select just it - unless it's already selected!
    Nametag.Methods.Clicking._nametagClick = function(event){
        var item = this;
        
        /* setting this to true will interrupt the __clickitem__ 
        event that would have otherwise fired; they test this 
        for that very reason, with a setTimeout call delayed 
        Nametag.Runtime.doubleClickDelay msecs */
        
        if(item.itemlist.mouseselectable && item.isSelectable){
            //find out what the closest clickable thing is to the actual item that got clicked... was it us?
            var scope = item.itemlist._determineClosestClickableNametag(event);
            
            if(scope === item || scope === item.itemlist){
                Nametag.Runtime._doubleClickNotDetected = true;

                setTimeout(function(){
                    if(Nametag.Runtime._doubleClickNotDetected){
                        if(item.itemlist._selectable_click_handler)
                            item.itemlist._selectable_click_handler(item, event);
                        fire(item.itemlist, '__clickitem__', item, event);
                    }
                }, Nametag.Runtime.doubleClickDelay);
                
                return false;
            }
        }
        
        return true;
    };
    
    /* method to respond to a dblclick, working with state to cause singleclick setTimeout routines to stand down. */
    Nametag.Methods.Clicking._nametagDblclick = function(event){
        /* setting this to true will interrupt the __clickitem__ 
        event that would have otherwise fired; they test this 
        for that very reason, with a setTimeout call delayed 
        Nametag.Runtime.doubleClickDelay msecs */
        
        var list = this.itemlist;
        
        if(list.mouseselectable && this.isSelectable){
            Nametag.Runtime._doubleClickNotDetected = false;
            fire(list, '__dblclickitem__', this, event);
            return false;
        }
    };
    
    /* this will only let a nametag or nametag item *closest* to the click target fire - 
       a means for allowing clicks to drop through (to work with dragdrop) and yet only
       have effect where intended */
    Nametag.Methods.Clicking._determineClosestClickableNametag = function(event){
        //if we can find ourselves as the first nametag ancestor of event.target, we are the one 
        //to get the click.
        
        var scope = event.target;
            
        /* while we go up the chain, return the first node that meets our conditions for being click-accessible */
        while(scope){
            if(scope.tagName){
                var tagname = scope.tagName.toUpperCase();
                /* if one of our parents (the target right off, usually, is an input, bail immediately.) */
                if(tagname == "INPUT" || tagname == "SELECT" || tagname == "TEXTAREA")
                    return false;

                /* or if we find it's the closest clickable tag */
                else if(scope.itemlist && scope.itemlist.selectable && scope.itemlist.mouseselectable && scope.isSelectable)
                    return scope;
            }
                
            /* else continue up the ladder */
            scope = scope.parentNode;
        }
        
        return false;
    };
    
    ///// -------------------------------------------
    ///// START NAMETAG DRAG AND DROP IMPLEMENTATION, appliable to a nametag or nametag child via
    ///// drag and drop, dragItem and dropChild
    ///// This was REALLY cool to write, as it's so much richer then other models i'd written
    ///// (mostly cause event bubbling rocks...)
    ///// -------------------------------------------
    
    /* the only real state is idle, dragging, and dropped,
       but for purposes of UI response, it is preferred to 
       listen and test Nametag.Dragging.isDragging instead. */
    Nametag.Dragging = {state:'idle', isDragging:false};
    
    ///////////////////////////////////////////////////
    /// MAKE ELEMENT OR CHILD DRAGGABLE API
    ///////////////////////////////////////////////////
        
    //INTENT: methods to add on an item to let it manage selection
    NametagClass.prototype._drag = function(){      
        var self = this;
        //make the string a list as needed to reference info
        if(gettype(self.drag) == 'string')
            self.drag = stringToList(self.drag);
    };
    
    //INTENT: make a dragItem, i.e., one that responds to mousedown correctly
    NametagClass.prototype._dragItem = function(item){          
        //on mousedown look at state and issue events
        $(item).mousedown(NametagDraggingClass.prototype.dragItemMouseDown);
    };
    
    ///////////////////////////////////////////////////
    /// MAKE ELEMENT OR CHILD DROPPABLE API
    ///////////////////////////////////////////////////
    
    //INTENT: methods to register a nametag as a dropzone for a type given by self.drop
    NametagClass.prototype._drop = function(){
        var self = this;
        
        var dragmethods = NametagDraggingClass.prototype;
        
        $(self).mouseup(dragmethods.dropMouseUp);
        
        //only apply element-level mouseup catchers if droponchild isn't true..
        if(!self.droponchild || self.droponcontainer){
            $(self).mouseenter(dragmethods.dropMouseOver);
            $(self).mouseleave(dragmethods.dropMouseOut);
        }
    };
    
    //INTENT: make a drop item, i.e. one that executes the parent's mouse up, with itself as the 
    //self.dropppedChild value.
    NametagClass.prototype._dropChild = function(self){          
        var dragmethods = NametagDraggingClass.prototype;
        
        $(self).mouseup(dragmethods.dropChildMouseUp);
        $(self).mouseenter(dragmethods.dropChildMouseOver);
        $(self).mouseleave(dragmethods.dropChildMouseOut);
    };
    
    ///////////////////////////////////////////////////
    /// CANCEL DRAG DROP...
    ///////////////////////////////////////////////////
    
    //INTENT: setup cancelling of dragdrop on esc.
    $(window).keyup(function(e){ 
        if(e.keyCode == 27 && Nametag.Dragging.state == "dragging")
            //NOTE that passing null instead of false tells drag drop esc was pressed vs. just dropping somewhere invalid
            NametagDraggingClass.prototype.dragDropping(null, null);
        return true;
    });
    
    ///////////////////////////////////////////////////
    /// IMPLEMENTATION FOR LOGIC OF DRAG/DROP EVENTS: WHAT TO DO WHEN CLICK, DRAG, OR DROP DETECTED
    ///////////////////////////////////////////////////
    
    var NametagDraggingClass = function(){
        return this;
    };
    
    //INTENT: what to do when we detect a click and NOT a drag..
    //NametagDraggingClass.prototype.dragClicked = function(event){
    //    var Dragging = Nametag.Dragging;
    //    Dragging.state = "idle";
    //    
    //    if(Dragging.tag && Dragging.tag.mouseselectable){
    //        
    //        //find out what the closest clickable thing is to the actual item that got clicked... was it us?
    //        var scope = Dragging.tag._determineClosestClickableNametag(event);
    //        
    //        if(scope === Dragging.item || scope === Dragging.tag){
    //            //indicate we are no longer waiting (for purposes of setTimeout, above)
    //            Nametag.Runtime._doubleClickNotDetected = true;
    //    
    //            setTimeout(function(){
    //                /* if the click has not been canceled by detecting a dblclick,
    //                   run the click */
    //    
    //                if(Nametag.Runtime._doubleClickNotDetected){
    //                    if(Dragging.tag._selectable_click_handler)
    //                        Dragging.tag._selectable_click_handler(Dragging.item, event);
    //                    fire(Dragging.tag, "__clickitem__", Dragging.item, event);
    //                }
    //    
    //                /* very necessary so that the item is not re-clicked by accident (in the state machine).
    //                   it would have to be reselected by mousedown... */
    //                Dragging.item = false;
    //    
    //            }, Nametag.Runtime.doubleClickDelay);
    //    
    //            return false;
    //        }
    //    }
    //    
    //    return true;
    //};

    //INTENT: what to do when a drag is detected and starting
    NametagDraggingClass.prototype.dragDragging = function(event){
        var Dragging = Nametag.Dragging;
        
        event.offsetX = (event.offsetX != null) ? event.offsetX : event.originalEvent.layerX;
        event.offsetY = (event.offsetY != null) ? event.offsetY : event.originalEvent.layerY;

        //notify machinery dragging has started
        var results = fire(Dragging.tag, "__dragging__", Dragging._draggedItems, Dragging.tag.drag);
        
        if(results === false){
            Dragging.state = "idle";
            return false;
        }
        
        Dragging.state = "dragging";
        set(Dragging, 'isDragging', true);
        
        Dragging.droppedchild = false;
        Dragging.tag.isDragging = true;
        Dragging.item.isDragging = true;
        
        /* logic needed to set selection on a dragged object if options so direct */
        if(Dragging.tag.selectondrag){
            if(!Dragging.tag.multiselectable)
                Dragging.item.setSelection();
            else
                Dragging.item.select();
        }else if(!Dragging.item.selected){
            Dragging.item.setSelection();
        }   
        
        //make a list of dataitems that is structured like items.data[i] to use
        //if dragdataonly is true, so that if the source dies during the drag it 
        //doesn't matter. that's a choice the dragger makes, not the droppee
        
        Dragging._draggedItems = [];
        for(var i = 0; i < Dragging.tag.selectedItems.length ; i ++)
            Dragging._draggedItems.push({
                data:copy(Dragging.tag.selectedItems[i].data),
                item:Dragging.tag.selectedItems[i]
            });
        
        //store the original icon position so we can animate back to it if the drag is canceled.
        Dragging.originalPosition = [event.pageX-event.offsetX, event.pageY-event.offsetY];
        
        if(Dragging.tag.__manualdragging__ === undefined){
            //either way (script or copy) we store them on this div for display    
            Dragging.icon = EmptyDiv.cloneNode(true);

            /* convert the drag into a list if it is not. having it here means
               we can change it after we start, if we want
             */
            if(gettype(Dragging.tag.drag) == 'string')
                Dragging.tag.drag = stringToList(Dragging.tag.drag);

            //do we make a custom drag script that gets the list of items from .data?
            if(Dragging.tag.dragtemplate){
                var item = create(Dragging.icon, Dragging.tag.dragtemplate, {items:Dragging.tag.dataFromSelected()}, Dragging.tag.server);
            }

            //or do we 'merely' copy the dom item into a list capped at 4 items that fade out to represennt a larger set..
            else{
                var dragicons_to_add = Dragging._draggedItems;
                dragicons_to_add = dragicons_to_add.slice(0, Math.min(dragicons_to_add.length, 5));
                for(var i = 0; i < dragicons_to_add.length ; i ++){
                    /* if it's a shadow_item use the inner_script (or script) of the name tag to make an item for it
                       on the spot. by passing false as the first arg to createUnaddedItem, we just get the item back
                       without adding it (until we're ready, belofw) */
                    
                   var item, jitem;
                   if(!dragicons_to_add[i].item.ELEMENT_NODE)
                       item = createUnaddedItem(
                           false, Dragging.tag.inner_script || Dragging.tag.script, dragicons_to_add[i].data
                       );
                   else
                       item = dragicons_to_add[i].item.cloneNode(true);
                    
                    /* now that we have an item, move it into position and fade it out */
                    jitem = $(item);
                    Dragging.icon.appendChild(item);

                    jitem.css('position', 'relative')
                         .css('top', '0px')
                         .css('left', '0px')
                         .css('height', $(Dragging.item).height()+"px")
                         .css('width', $(Dragging.item).width()+"px")
                         .fadeTo(0, 0.8/(i+1));

                    if(Dragging.tag.selectable){                        
                        jitem.removeClass(Dragging.tag.selectable[0]).removeClass(Dragging.tag.selectable[1]);
                        
                        if(Dragging.tag.selectable[2])
                            jitem.addClass(Dragging.tag.selectable[2]);
                    }   
                }
            }

            //add attributes to the dragicon it needs to move, etc
            var jdragicon = $(Dragging.icon);
            jdragicon
                .addClass('absolute')
                .css("top", event.pageY+1)
                .css("left", event.pageX+1)
                .css("font-size", "0.8em")
                .css("z-index", 99999);
                    
            jdragicon.appendTo(Nametag.Body);
        }
        
        else{
            for(var i = 0; i < Dragging._draggedItems.length ; i ++){
                var item = Dragging._draggedItems[i].item;
                item._baseX = $(item).left();
                item._baseY = $(item).top();
            }
        }
        
        //when the body sees the mouse move, move the dragicon with it
        $(document).mousemove(function(e){
            //the +1 makes sure the script is out of the way of the elem to send events to the /other/ objs!
            if(Dragging.tag.__manualdragging__ === undefined)
                jdragicon.css("top", e.pageY+11).css("left", e.pageX+11);
            
            /* else they choose the manual drag option, and get a rel xy from the drag start point. */    
            else{
                var items_to_send = Dragging.tag.multiselectable !== false ? 
                    Dragging._draggedItems : Dragging._draggedItems[0];
                
                var dx = e.pageX-Dragging.baseX, dy = e.pageY-Dragging.baseY;
                fire(Dragging.tag, '__manualdragging__', items_to_send, dx, dy);
            }
                
            return true;
        });
        
        //notify everyone dragging has started (state will be dragging)
        send(Nametag, "Dragging");
    };
    
    //what to do, when drop occurs: remove drag script and issue dropped on 
    //anything that is dropped...
    NametagDraggingClass.prototype.dragDropping = function(target, event){
        var Dragging = Nametag.Dragging;
        var dragmethods = NametagDraggingClass.prototype;
        
        //indicate we are no longer waiting (for purposes of setTimeout, above)
        Dragging.state = "idle";
        set(Dragging, 'isDragging', false);
        Dragging.item.isDragging = false;
        Dragging.tag.isDragging = false;
        
        //stop looking for the mouse to move
        $(document).unbind("mousemove");
        
        //if we are manually dragging and manuallydropped ret false, then stop
        //NOTE: if target === null then we know ESC was pressed and manuallydropped doesn't apply
        if(Dragging.tag.__manuallydropped__){
            if(target === null)
                Dragging.tag.fire("__manuallycanceled__", target, event);
            else
                Dragging.tag.fire("__manuallydropped__", target, event);
                
            return false;
        }
        
        //if there is no droptarget, we are being told to cancel drag drop - so don't just remove icon,
        //animate to original xy THEN erase it
        if(!target){
            
            if(Dragging.originalPosition){
                
                $(Dragging.icon).animate({
                    top:Dragging.originalPosition[1], left:Dragging.originalPosition[0]
                }, {duration:Nametag.GUI.duration});
                
                setTimeout(dragmethods.removeDragItems, Nametag.GUI.duration+1);
            }
        }
        
        //if the drop was valid, issue events to get response; DONT do it if the dragitem is same as DroppedChild  or dragitem same as target!
        else{                
            NametagDraggingClass.prototype.removeDragItems();
                
            //if the element has been killed in the meantime - provide ONLY the data on a new object structured the same way
            var draggedItems = [];
            if(Dragging.tag.data !== null)
                for(var i = 0; i < Dragging._draggedItems.length ; i ++)
                    draggedItems.push(Dragging._draggedItems[i].item);
            
            //otherwise the source of the drag is dead so give them what we originally made -- a copy of the data. we cant know if we need the copy until now the other tag can be collected now
            else
                draggedItems = Dragging._draggedItems;
            
            //notify machinery dropping is occuring
            if(Dragging.tag.fire("__dropping__", draggedItems, target, event) !== false){

                //if we drop on children, send child we dropped on and after flag (for last half of last item , paste after)
                if(target.droponchild && Dragging.droppedchild){
                    //ONLY set afterFlag to true if they dropped on the second half of the last item!
                    var afterFlag = false;;

                    //if no children, put it after in all cases
                    if(target.childNodes.length === 0)
                        afterFlag = true;

                    //else if the droppedchild is the last child on it's parent
                    else if(target.items.indexOf(Dragging.droppedchild) == target.items.length-1)
                        afterFlag = true;

                    //finally, if droppedchild is false, users of the system should append items received to the list    
                    var droppedchild = afterFlag ? false : Dragging.droppedchild;

                    //tell the machinery about the drop, with a DroppedChild, and afterFlag (if nametag.droppedChildren is true...)
                    target.fire("__drop__", draggedItems, droppedchild, Dragging.tag.drag, Dragging.tag, event);
                    target.fire("__dropped__", draggedItems, droppedchild, Dragging.tag.drag, Dragging.tag, event);
                }

                //otherwise dropping on the nametag, need only the item and droptype
                else{
                    if(target.droponcontainer){
                        target.fire("__drop__", draggedItems, target, Dragging.tag.drag, Dragging.tag, event);
                        target.fire("__dropped__", draggedItems, target, Dragging.tag.drag, Dragging.tag, event);
                    }
                        
                    else{
                        target.fire("__drop__", draggedItems, Dragging.tag.drag, Dragging.tag, event);
                        target.fire("__dropped__", draggedItems, Dragging.tag.drag, Dragging.tag, event);
                    }
                        
                }
            }
        }
        
        //get rid of any _draggedItems stored on the tag
        Dragging._draggedItems = null;
        
        //notify everyone dragging has stopped (state will be idle)
        send(Nametag, "Dragging");
        
        return false;
    };
    
    //INTENT: remove all children -- if they are scripts use their remove(), not jquery's
    NametagDraggingClass.prototype.removeDragItems = function(){
        var Dragging = Nametag.Dragging;
        
        //do we remove a nametag or a copy of the list item?
        var children = $.makeArray($(Dragging.icon).children());
        if(Dragging.tag.dragtemplate)
            for(var i = 0; i < children.length ; i ++)
                children[i].remove();
                
        else
            for(var i = 0; i < children.length ; i ++)
                $(children[i]).remove();
    };
    
    ///////////////////////////////////////////////////
    /// DRAGGABLE CHILDREN
    ///////////////////////////////////////////////////
    
    NametagDraggingClass.prototype._nonDraggableTargetTypes = ['input', 'textarea', 'select'];
    
    //INTENT: what to do when mouse downing on a drag Item
    NametagDraggingClass.prototype.dragItemMouseDown = function(event){
        //if not primary click (i.e. right click), dont catch it
        //if we are not selectable as a custom override (isSelectable), dont catch it
        //VERY IMPORTANT, if the target of the event is a input, textarea, select, etc, let it fall through.
        if((event.which != 1 || event.which === undefined) || !this.isSelectable)
            return true;
            
        var tagname = event.target.tagName.toLowerCase();
        if(tagname == 'input' || tagname == 'textarea' || tagname == 'select')
            return true;
            
        var item = this;
        var Dragging = Nametag.Dragging;
        var dragmethods = NametagDraggingClass.prototype;
        
        //if we are not idle, we are still waiting for another event to resolve; reject.
        if(Dragging.state != "idle")
            return true;
        
        Dragging.state = "waiting";    
        Dragging.item = item;
        Dragging.tag = item.itemlist;
        Dragging.baseX = event.pageX;
        Dragging.baseY = event.pageY;
        
        //if this fires with dragstate still on waiting [for cancel], we dra
        setTimeout(function(){
            //if we are still waiting for mouseup, on our ourselves, we are dragging!
            if(Dragging.state == "waiting" && Dragging.item == item){
                var dx = Math.abs(Dragging.baseX-Nametag.GUI.mousemove.pageX);
                var dy = Math.abs(Dragging.baseY-Nametag.GUI.mousemove.pageY);
                dragmethods.dragDragging(event);
            }
                
        }, Nametag.Runtime.dragdelay);
        
        return false;
    };
    
    ///////////////////////////////////////////////////
    /// DROPPABLE NAMETAG
    ///////////////////////////////////////////////////
    
    NametagDraggingClass.prototype.dropMouseUp = function(event, list){  
        /* note that dropMouseUp may be called directly by dropChildMouseUp so that 
           event bubbling (as was originally done) is not required. in that case, the 2nd
           arg will be the list the child dropped on belongs to, and so if present we set self to
           it (this would be the list to, if the dropChildMouseUp event didn't get it first) */
        var self = list || this;
        
        var Dragging = Nametag.Dragging;
        /* WHY make an instance of the class, IN the class? because the execution environment of this method 
           will be the item we are mouse upping on... NOT the original class! the class method is done for
           speed and exception resilience. */
        var dragmethods = NametagDraggingClass.prototype;
        
        //if we WERE drug over some nametag and there is a dragout method left to call
        if(Dragging.drugOver){
            if(self.__dragout__)
                self.__dragout__(Dragging.drugOver);
            Dragging.drugOver = false;
        }
        
        //if we WERE drug over some child and there is a dragout method left to call
        if(Dragging.drugOverChild){
            if(Dragging.drugOverChild.itemlist && Dragging.drugOverChild.itemlist.__dragout__)
                Dragging.drugOverChild.itemlist.__dragout__(Dragging.drugOverChild);
            Dragging.drugOverChild = false;
        }
            
        if(!Dragging.tag || !Dragging.item || Dragging.state == 'idle')
            return true;
            
        else if(Dragging.item && Dragging.state != "dragging"){
            Dragging.state = "idle";
            return false;
        }
            
        else if(Dragging.state == "dragging"){
            if(NametagDraggingClass.prototype.isDragAccepted(self)){
                dragmethods.dragDropping(self, event);   
                return false;
            }
                
            else
                dragmethods.dragDropping(false, false);   
        }   
        
        return true;
    };
    
    NametagDraggingClass.prototype.isDragAccepted = function(self){
        var Dragging = Nametag.Dragging;
        
        /* if we can't drop on others, and we're trying to, cancel the drag by passing false, false to dragDropping */
        if(Dragging.tag.droponothers === false && self !== Dragging.tag){
            return false;
        }
        
        /* if dropping on container and droponself not allowed, reject */
        else if(!Dragging.tag.droponself && self == Dragging.tag){
            return false;
        }   
        
        //if droponchild reject dropping onto the thing dragging);
        else if(self.droponchild && !self.droponcontainer){
            //reset if no DroppedChild, we are not droponself but on the drag item or ourselves
            if(!Dragging.droppedchild || Dragging.tag.droponself !== true && self.isDragging || Dragging.droppedchild.isDragging){
                return false;
            }    
        }
            
        //if not droponchild reject dropping onto a dragging element
        else if(self.isDragging && Dragging.tag.droponself !== true && Dragging.tag.droponcontainer !== true){
            return false;
        }
        
        //otherwise it's valid, but of the right type?
        if(self.drop.length && self.drop.intersect(Dragging.tag.drag) || self.drop == '*'){
            /* if dropping on both, we'll make the signature look like the one for children, with the child set to self */ 
            return true;
        }
        
        return false;
    }
    
    //INTENT: what to do when over a drop nametag
    NametagDraggingClass.prototype.dropMouseOver = function(e){
        var self = this;
        var Dragging = Nametag.Dragging;
        
        //show over only if we are dragging...
        if(Dragging.state == "dragging"){
            if(NametagDraggingClass.prototype.isDragAccepted(self)){
                if(self.__dragover__)
                    self.__dragover__(self)
                Dragging.drugOver = self;
                return false;
            }
        }   
        
        return true;
    };
    
    //INTENT: what to do when moving out of a drop nametag
    NametagDraggingClass.prototype.dropMouseOut = function(e){
        var self = this;
        var Dragging = Nametag.Dragging;
        
        if(Dragging.drugOver){
            if(self.__dragout__)
                self.__dragout__(Dragging.drugOver);
            Dragging.drugOver = false;
            return false;
        }
        
        return true;
    };
    
    ///////////////////////////////////////////////////
    /// DROPPABLE CHILDREN
    ///////////////////////////////////////////////////
    
    /* what to do when a child has mouse up during drag (droponchild has to be true) */
    NametagDraggingClass.prototype.dropChildMouseUp = function(e){
        var self = this;
        var Dragging = Nametag.Dragging;
        
        var dragmethods = NametagDraggingClass.prototype;
        
        if(Dragging.state != "dragging" && Dragging.item){
            Dragging.state = "idle";
            return false;
        }
        
        if(Dragging.drugOverChild && Dragging.drugOverChild.itemlist && Dragging.drugOverChild.itemlist.__dragout__)
            Dragging.drugOverChild.itemlist.__dragout__(Dragging.drugOverChild);
                
        if(Dragging.drugOver && Dragging.drugOver.itemlist){
            if(Dragging.drugOver.itemlist.__dragout__)
                Dragging.drugOver.itemlist.__dragout__(Dragging.drugOver);
            Dragging.drugOver = false;
        }
            
        Dragging.droppedchild = self;
        
        /* note that we changed the pattern to call dropMouseUp up directly, before it was done via bubbling. i find 
           this more reliable (and compreshensible - it is dropMouseUp, always attached to the list and not child,
           that actually does comparisons for matching and drop logic) */
        return dragmethods.dropMouseUp(e, self.itemlist);
    };
    
    /* what to do when a child is moused over during drag (droponchild has to be true) */
    NametagDraggingClass.prototype.dropChildMouseOver = function(){
        var self = this;
        var Dragging = Nametag.Dragging;
        
        if(!Dragging.tag)
            return true;
        
        //mouse over only if drag ongoing, we're not already drug over, we are self-drop, or not self drop and not over ourselves.
        if(Dragging.state == "dragging")
        
            //but only if it's the right type...
            if(self.itemlist.drop && self.itemlist.drop.intersect(Dragging.tag.drag)){
                
                // and if it's not selected (or the nametag we're dropping on is different then the drag one), 
                //and we haven't called dragover on it twice, and if container-selfdropping is allowed, and if dropontothers is false,
                //the call the dragover method on the child. 
                if( (!self.selected || (self.itemlist != Dragging.tag)) && 
                    (Dragging.tag.droponself !== true || self.isDragging !== true) && 
                    (Dragging.tag.droponself === true || self.itemlist.isDragging !== true) && 
                    (Dragging.tag.droponothers !== false || self.itemlist === Dragging.tag)){
                        
                    /* fire the drag over event passing the child we're over  */
                    fire(self.itemlist, '__dragover__', self);
                    Dragging.drugOverChild = self;
                    return false;
                }
            }

        return true;
    };
    
    /* what to do when a child is moused out from, during drag (droponchild has to be true) */
    NametagDraggingClass.prototype.dropChildMouseOut = function(){
        var self = this;
        var Dragging = Nametag.Dragging;
        
        if(Dragging.drugOverChild){
            fire(self.itemlist, '__dragout__', Dragging.drugOverChild);
            Dragging.drugOverChild = false;
            return false;
        }
        return true;
    };
    
    /* this will first remove all hitches made, then, using the saved text of all hitches initially present (stored in
       self._hitchestext), we'll reevaluate all hitches. this is very useful when removing and re appending a child
       somewhere - they can continue to respond to dimnesionally hitchs  */
    NametagClass.prototype.rehitch = function(){
        var element = this;
        
        if(element._hitchBindings.release)
            element._hitchBindings.release();
        
        //returns a triplet of references found by looking upward. central to the model.
        var references = element._resolveParentReferences();
        
        //The 'parentNametag' attr works by finding the first tag with a .nametag attribute 
        //above this tag (one of the reasons the attribute is there)
        //we also alias it with parent. there is no .parent in the W3C dom (it's .parentNode) so this is legit.
        element.parentNametag = element.parent = references[0];
        
        //The scriptroot is analogous to a top of some nametag defintion/instance. when you make a 
        //nametag, it must have a name. anonymous views inside it have have no script attribute
        //so if we go up to the first tag with a script attribute we can skip upwards effectively.
        //we also alias it with root. it comes up a lot.
        element.scriptroot = element.root = references[1]
        
        //The 'itemroot' works by finding the first node above it with an .itemlist attribute
        //and lets us skip to the 'top' of an item made by a nametag list
        element.itemroot = references[2];
        
        copy(element.scanAttributes(element._hitchestext, element, true, true), element);
        
        /* and perform any hitches that have scheduled themselves to be run on init just as it's done in the base system */
        setTimeout(function(){
            element._performAutohitches();
        });
        
    };
    
    /* just a convienence; balances rehitch */
    NametagClass.prototype.unhitch = function(){
        var element = this;
        
        if(element._hitchBindings.release)
            element._hitchBindings.release();
    };
    
    //INTENT: given a dictionary, if any key of the dict starts and ends with %{ and }, or %%{} in the case of hitches,
    //so as to listen to a given attribute and do something when that attribute is changed 
    NametagClass.prototype.scanAttributes = function(incoming_dict, context, process_hitches, forceReloadOfHitches, promoteDelegateTextToFunction){
        var output = {};
    
        for(var key in incoming_dict){
            try{
            
                /* if an attribute starts with an '@', then we should apply it as a trait, after reassigning the value w/out the '@' sign */
                if(key.slice(0,1) == '$'){
                    context._traitsFromOptions.push(key.slice(1));
                    output[key] = incoming_dict[key];
                }
            
                /* make a function out of the statement they gave and set the 
                   attr to the result of running it now - we'll control context, passing in 'self' for convienence! */
                else if(incoming_dict[key].slice(0, 2) == '%{' && incoming_dict[key].slice(-1) == "}"){
                    var attr_text = incoming_dict[key].slice(2, -1);
                    
                    try{
                        eval("output[key] = function(self){return "+attr_text+";}");
                        output[key] = output[key].call(context, context);
                    }catch(err){
                        err.message = "\nIn the context of the code:\n\n"+attr_text+"\n\n...\n\n"+err.message;
                        throw err;
                    }
                    
                    /* save the string. if we want to reapply hitches, we have but to call _hitchBindings.release(), reassign these to the keys they were on,
                       then process those with self.scanAttributes again. viola. */
                    context._hitchestext[key] = String(incoming_dict[key]);
                }
            
                //if it's got the magic %%{..} at beginning and end of string...
                else if(process_hitches !== false && incoming_dict[key].slice(0, 3) == '%%{' && incoming_dict[key].slice(-1) == "}"){                    
                
                    /* i should reset these - as i found out, a otherwise empty var statement does NOT re-initialize the pointer if it's already been created in a previous loop! */
                    var hitch = undefined, 
                        hitch_parts = undefined, 
                        hitch_target_parts = undefined, 
                        hitch_delay_function = undefined,
                        hitch_targets = undefined, 
                        hitch_conditional_segments = undefined, 
                        first_hitch_target = undefined, 
                        first_hitch_attr = undefined,
                        hitch_conditional_target = undefined, 
                        hitch_conditional_attr = undefined, 
                        hitch_conditional_or = undefined;
            
                    var autohitch_flag = false;
                
                    /* we only evaluate hitches on first load. */
                    if(context.initialized && forceReloadOfHitches === undefined)
                        continue;
                    
                    /* save the string. if we want to reapply hitches, we have but to call _hitchBindings.release(), reassign these to the keys they were on,
                       then process those with self.scanAttributes again. viola. */
                    context._hitchestext[key] = String(incoming_dict[key]);
                
                    /* this the text of the entire hitch including all parts. */
                    var attr_text = incoming_dict[key].slice(3, -1).trim();
                
                    /* if it starts with a '!' record that this hitch should be auto-hitched, that is, synced on create. note
                       that width, height, top, left, opacity do this automatically in the normal setup */
                    if(attr_text[0] == "!"){
                        autohitch_flag = true;
                        attr_text = attr_text.slice(1);
                    }
                
                    /* hitch_parts consists of each ;; part, where the order indicates what does what (1st part is target, 2nd what to do, 3rd default value, 4th is function to run at start whose value is ignored) */
                    hitch_conditional_segments = attr_text.split("::");
                
                    if(hitch_conditional_segments[1]){
                        try{
                            eval("hitch_conditional_or = function(self, value){return "+hitch_conditional_segments[1]+";};");
                        }catch(err){
                            err.message = "\nIn the context of the code:\n\n"+hitch_conditional_segments[1]+"\n\n...\n\n"+err.message;
                            throw err;
                        }
                    }
                        
                    hitch_parts = hitch_conditional_segments[0].split(";;");
                    hitch_target_parts = hitch_parts[0].split('??');
                    
                    //if a delay is given, record it
                    hitch_delay_value_parts = hitch_target_parts[0].split("...");
                    if(hitch_delay_value_parts.length > 1){
                        hitch_target_parts[0] = hitch_delay_value_parts.slice(1).join("");
                        
                        var hitch_delay_text = hitch_delay_value_parts[0];
                        
                        /* turn the delay object string into the actual object  */ 
                        var get_obj_reference;
                        try{
                            eval("hitch_delay_function = function(self){return "+hitch_delay_text+";}");
                        }catch(err){
                            err.message = "\nIn the context of the code, when evaluating hitch delay function:\n\n"+hitch_delay_text+"\n\n...\n\n"+err.message;
                            throw err;
                        }
                    }                
                
                    /* determine if the hitch has a conditional which we will record and act on if present, below */
                    if(hitch_target_parts.length > 1){
                        var hitch_conditional_pair = hitch_target_parts[0].trim().split('.');
                    
                        hitch_conditional_target = hitch_conditional_pair.slice(0, -1).join(".");
                        hitch_conditional_attr = hitch_conditional_pair.slice(-1)[0];
                    
                        /* turn the condition object string into the actual object  */ 
                        var get_obj_reference;
                        try{
                            eval("get_obj_reference = function(self){return "+hitch_conditional_target+";}");
                            hitch_conditional_target = get_obj_reference.call(context, context);
                        }catch(err){
                            err.message = "\nIn the context of the code:\n\n"+hitch_conditional_target+"\n\n...\n\n"+err.message;
                            throw err;
                        }
                        
                        /* the hitch targets are on the other side of the ? */
                        hitch_targets = stringToList(hitch_target_parts[1].trim());
                    }
                
                    /* or there was no conditional the entire 1st part is targets */
                    else
                        hitch_targets = stringToList(hitch_target_parts[0].trim());
                        
                    
                    //if there is no preexisting delay function and we have targets, find the target with autoanimated
                    //and the largest autospeed (or the default Nametag.GUI.duration, whichever is greater) and use it 
                    //as the delay, automatically. experimentally, this should let animations naturally cascade to resolve
                    //into a perfect state everytime.
                    if(!hitch_delay_function && hitch_targets.length){
                        var maxtime = 0;
                        
                        for(var i = 0; i < hitch_targets.length ; i ++){    
                            var obj = hitch_targets[i].split(".").slice(0, -1).join(".");
                            var attr = hitch_targets[i].split(".").slice(-1)[0];
                            
                            /* turn the condition object string into the actual object  */ 
                            var get_obj_reference;
                            var obj_reference;
                            try{
                                eval("get_obj_reference = function(self){return "+obj+";}");
                                obj_reference = get_obj_reference.call(context, context);
                            }catch(err){
                                err.message = "\nIn the context of the maxtime code:\n\n"+hitch_targets[i]+"\n\n...\n\n"+err.message;
                                throw err;
                            }

                            if(obj_reference && obj_reference.autoanimated && (obj_reference.autoanimated.indexOf(attr) || obj_reference.autoanimated === true || obj_reference.autoanimated.toLowerCase() == 'true' ))
                                maxtime = Math.max(maxtime, obj_reference.autospeed || Nametag.GUI.duration/2);
                        }
                            
                        //if a time was found
                        if(maxtime > 0){
                            /* turn the delay object string into the actual object  */ 
                            var get_obj_reference;
                            try{
                                eval("hitch_delay_function = function(self){return "+maxtime+";}");
                            }catch(err){
                                err.message = "\nIn the context of the code, when evaluating hitch delay function:\n\n"+maxtime+"\n\n...\n\n"+err.message;
                                throw err;
                            }
                        }
                    }     
                    
                    /* WE WILL resolve the first target as the "value" to pass to the method. if there is more than one hitch,
                       they will all get passed this value. This makes hitches invariant under listens, that is, no matter 
                       who sets the hitch up to listen to what, 'value' will always be the same thing - the first target.
                       if you are using more than one target, use their full names if you want the value of more than the first target.
                       this works really well for conditionals that, since they listen to the conditional object/attr pair, would
                       otherwise pass that value in, when we meant the value of the first target.  */
                       /* the target (i.e. 'self.x.y.z') needs to be split into obj text ('self.x.y') and attr (index of last '.' to end is attr, i.e. 'z') */
                    if(hitch_targets.length){
                        var target_parts = hitch_targets[0].split(".");
                        var objname = target_parts.slice(0, -1).join(".");
                        first_hitch_attr = target_parts.slice(-1)[0];

                        var get_obj_reference;
                        try{
                            eval("get_obj_reference = function(self){return "+objname+";}");
                            first_hitch_target = get_obj_reference.call(context, context);
                        }catch(err){
                            err.message = "\nIn the context of the code:\n\n"+objname+"\n\n...\n\n"+err.message;
                            throw err;
                        }
                    }
                
                    /* hitch with ONE part - set attr to value of whatever we're listening to */
                    if(hitch_parts.length === 1){
                    
                        /* if there is a condition make a hitch with the condition in the closure */
                        if(hitch_conditional_target){
                            hitch = function(self, key, first_hitch_target, first_hitch_attr, hitch_conditional_target, hitch_conditional_attr, hitch_conditional_or, hitch_delay_function){
                                return function(){
                                    if(hitch_delay_function){
                                        setTimeout(function(){
                                            if(hitch_conditional_target[hitch_conditional_attr])
                                                set(self, key, first_hitch_target[first_hitch_attr])
                                            else if(hitch_conditional_or)
                                                set(self, key, hitch_conditional_or.call(self, self, first_hitch_target[first_hitch_attr]));
                                        }, hitch_delay_function.call(context, context));
                                    }
                                    
                                    else{
                                        if(hitch_conditional_target[hitch_conditional_attr])
                                            set(self, key, first_hitch_target[first_hitch_attr])
                                        else if(hitch_conditional_or)
                                            set(self, key, hitch_conditional_or.call(self, self, first_hitch_target[first_hitch_attr]));
                                    }
                                }
                            }(context, key, first_hitch_target, first_hitch_attr, hitch_conditional_target, hitch_conditional_attr, hitch_conditional_or, hitch_delay_function);
                        }
                    
                        /* else just make the simplest possbile hitch, that of setting the local attr to the value of the target.
                           note we dont pass in the first_hitch_attr and target since only a single listen - on the actual target
                           is generated (conditional would be a second meta-target, and make value eq. true, etc.. when we meant 
                           the value, but that is only for hitches with conditionals.) */
                        else{
                            hitch = function(self, key, hitch_delay_function){
                                return function(value){
                                    
                                    if(hitch_delay_function){
                                        setTimeout(function(){
                                            set(self, key, value);
                                        }, hitch_delay_function.call(self, self));
                                    }
                                    
                                    else
                                        set(self, key, value);
                                }
                            }(context, key, hitch_delay_function);
                        }
                    }
                
                    /* hitch with TWO parts - listen to part 1 (self.x.y.z for listening to 'z' on self.x.y) and run part 2 (any expression) whose return result is set on self via the attr name */
                    else{
                        /* get the expression to run (and return a value for when the obj/attr combo is set) */
                        var codeblock = hitch_parts[1].trim();

                        if(codeblock){
                            /* get rid of any trailing ; if the user puts it there as a nicety */
                            if(codeblock.slice(-1) == ";")
                                codeblock = codeblock.slice(0, -1)

                            /* IF there is a target, we set the local variable. */
                            if(hitch_targets.length){
                            
                                /* if there is a conditional include it in the hitch */
                                if(hitch_conditional_target){
                                    var custom_function;
                                    try{
                                        eval("custom_function = function(self, value){return "+codeblock+";}");
                                    }catch(err){
                                        err.message = "\nIn the context of the code:\n\n"+codeblock+"\n\n...\n\n"+err.message;
                                        throw err;
                                    }
                                    
                                    hitch = function(self, key, custom_function, first_hitch_target, first_hitch_attr, hitch_conditional_target, hitch_conditional_attr, hitch_conditional_or, hitch_delay_function){
                                        return function(){
                                            if(hitch_delay_function){
                                                setTimeout(function(){
                                                    if(hitch_conditional_target[hitch_conditional_attr])
                                                        set(self, key, custom_function.call(self, self, first_hitch_target[first_hitch_attr]));

                                                    else if(hitch_conditional_or)
                                                        set(self, key, hitch_conditional_or.call(self, self, first_hitch_target[first_hitch_attr]));
                                                }, hitch_delay_function.call(self, self));
                                            }
                                            
                                            else{
                                                if(hitch_conditional_target[hitch_conditional_attr])
                                                    set(self, key, custom_function.call(self, self, first_hitch_target[first_hitch_attr]));

                                                else if(hitch_conditional_or)
                                                    set(self, key, hitch_conditional_or.call(self, self, first_hitch_target[first_hitch_attr]));
                                            }
                                        }
                                    }(context, key, custom_function, first_hitch_target, first_hitch_attr, hitch_conditional_target, hitch_conditional_attr, hitch_conditional_or, hitch_delay_function);
                                }
                            
                                /* if there isn't, dont. */
                                else{
                                    var custom_function;
                                    try{
                                        eval("custom_function = function(self, value){return "+codeblock+";}");
                                    }catch(err){
                                        err.message = "\nIn the context of the code:\n\n"+codeblock+"\n\n...\n\n"+err.message;
                                        throw err;
                                    }
                                    
                                    hitch = function(self, key, custom_function, first_hitch_target, first_hitch_attr, hitch_delay_function){
                                        return function(){
                                            if(hitch_delay_function){
                                                setTimeout(function(){
                                                    return set(self, key, custom_function.call(self, self, first_hitch_target[first_hitch_attr]));
                                                }, hitch_delay_function.call(self, self));
                                            }
                                            
                                            else
                                                return set(self, key, custom_function.call(self, self, first_hitch_target[first_hitch_attr]));
                                        }
                                    }(context, key, custom_function, first_hitch_target, first_hitch_attr, hitch_delay_function);
                                }
                            }

                            /* if there is NO target, we merely run the code! */
                            else{
                                var custom_function;
                                try{
                                    eval("custom_function = function(self, value){"+codeblock+";}");
                                }catch(err){
                                    err.message = "\nIn the context of the code:\n\n"+codeblock+"\n\n...\n\n"+err.message;
                                    throw err;
                                }
                                
                                if(hitch_conditional_target){
                                    hitch = function(self, key, custom_function, hitch_conditional_target, hitch_conditional_attr, hitch_conditional_or, hitch_delay_function){
                                        return function(value){
                                            if(hitch_delay_function){
                                                setTimeout(function(){
                                                    if(hitch_conditional_target[hitch_conditional_attr])
                                                        custom_function.call(self, self, value);
                                                    else if(hitch_conditional_or)
                                                        set(self, key, hitch_conditional_or.call(self, self, value));
                                                }, hitch_delay_function.call(self, self));
                                            }

                                            else
                                                if(hitch_conditional_target[hitch_conditional_attr])
                                                    custom_function.call(self, self, value);
                                                else if(hitch_conditional_or)
                                                    set(self, key, hitch_conditional_or.call(self, self, value));
                                        }
                                    }(context, key, custom_function, hitch_conditional_target, hitch_conditional_attr, hitch_conditional_or, hitch_delay_function);
                                }
                                else{
                                    hitch = function(self, key, custom_function, hitch_delay_function){
                                        return function(value){
                                            if(hitch_delay_function){
                                                setTimeout(function(){
                                                    custom_function.call(self, self, value);
                                                }, hitch_delay_function.call(self, self));
                                            }

                                            else
                                                custom_function.call(self, self, value);
                                        }
                                    }(context, key, custom_function, hitch_delay_function);
                                }
                            }
                        }
                    }
                
                    /* the actual listen call we'll need to use - note we use context arg to make this = self 
                       we do NOT use context.listen because any hitch is permenant for the life    */
                    if(!context._hitchBindings)
                        context._hitchBindings = {};

                    /* if there are NO targets, make one false one - interior
                       to the loop parts will be skipped that require it, 
                       but  */
                    if(hitch_targets.length === 0)
                        hitch_targets.push(false);
                
                    for(var i = 0; i < hitch_targets.length ; i ++){
                        var obj, attr;

                        /* if there is a target */
                        if(hitch_targets[i]){
                            /* the target (i.e. 'self.x.y.z') needs to be split into obj text ('self.x.y') and attr (index of last '.' to end is attr, i.e. 'z') */
                            var target_parts = hitch_targets[i].split(".");
                            var objname = target_parts.slice(0,-1).join(".");
                            attr = target_parts.slice(-1)[0];

                            var get_obj_reference;
                            try{
                                eval("get_obj_reference = function(self){return "+objname+";}");
                                obj = get_obj_reference.call(context, context);
                            }catch(err){
                                err.message = "\nIn the context of the code:\n\n"+objname+"\n\n...\n\n"+err.message;
                                throw err;
                            }
                        
                            /* add this as something we should fetch when the nametag is inited - the two qualification are being in attributes_to_autohitch and this hitch having a target */
                            if(autohitch_flag || Nametag.Runtime.attributes_to_autohitch.indexOf(key) !== -1)
                                context._autohitches.push([obj, attr, hitch, String(incoming_dict[key])]);
                        
                            /* remove the hitch text which will be set to the right value when the event fires */
                            output[key] = undefined;
                        }

                        /* otherwise we just use the context as the obj (no setting of the var will occur, just running a method, see below). */
                        else{
                            obj = context;
                            attr = key;
                        }
                    
                        /* crucial point: we set up _hitchBindings as a place to store
                           the listens made from hitches. unlike context.listen, these ONLY 
                           go away on __removed__, not on __reset__! */
                        
                        listen(obj, attr, hitch, context, context._hitchBindings);
                    
                        /* if we have a conditional hitch, we will also listen to it, so that we can reevaluate the hitch
                           when the value becomes true again, re-syncing the hitch with the target. */
                        if(hitch_conditional_target)
                            listen(hitch_conditional_target, hitch_conditional_attr, hitch, context, context._hitchBindings)
                    
                        /* DO HITCH PARTS 3 and 4 ON THE FIRST ITERATION (obj) only*/
                        if(i === 0){
                            /* if it has a third part, use it as the default value for the attr */
                            if(hitch_parts.length > 2){   
                                /* get the expression to run (and return a value for when the obj/attr combo is set) */
                                var default_value = hitch_parts[2].trim();

                                if(default_value){
                                    /* if they put a semi colon out of habit, nuke it */
                                    if(default_value.slice(-1) == ";")
                                        default_value = default_value.slice(0, -1)

                                    var get_obj_reference;
                                    try{
                                        eval("get_obj_reference = function(value){var self = this; return "+default_value+";}");
                                        var result = get_obj_reference.call(context, obj[attr]);
                                    }catch(err){
                                        err.message = "\nIn the context of the code:\n\n"+default_value+"\n\n...\n\n"+err.message;
                                        throw err;
                                    }
                                
                                    output[key] = result;
                                }
                            }

                            //a fourth arg will also be executed - but its results discarded i.e. misc init.
                            if(hitch_parts.length > 3){   
                                /* get the expression to run (and return a value for when the obj/attr combo is set) */
                                var default_value = hitch_parts[3].trim();

                                /* if they put a semi colon out of habit, nuke it */
                                if(default_value.slice(-1) == ";")
                                    default_value = default_value.slice(0, -1)

                                var get_obj_reference;
                                try{
                                    eval("get_obj_reference = function(value){var self = this; return "+default_value+";}");
                                    var result = get_obj_reference.call(context, obj[attr]);
                                }catch(err){
                                    err.message = "\nIn the context of the code:\n\n"+default_value+"\n\n...\n\n"+err.message;
                                    throw err;
                                }
                            }
                        }   
                    }
                }
                
                /* if it's a string but the key is a delegate and promoteDelegateTextToFunction is true than take the 
                   string, wrap it like a function, and put it back. just make function writing in attributes more tolerable.  */
                else if(promoteDelegateTextToFunction && key.startsendswith('__') && gettype(incoming_dict[key]) == 'string'){
                    try{
                        var self = context;
                        eval("output[key] = function(){"+incoming_dict[key]+";}");
                    }catch(err){
                        err.message = "Error when converting text to function on delegate method. Error is: "+String(err)+", text of attribute is: "+incoming_dict[key];                
                        throw err;
                    }
                }
                
                //else it's just normal
                else
                    output[key] = incoming_dict[key];
            }
            
            catch(e){
                Nametag.Debugger.error(
                    "Attribute "+key+", function had a problem, '"+key+"', had an error. Text of attr is:\n\n"+incoming_dict[key]+"\n\nand the error is: "+e
                );
            }
            
            finally{
               hitch = null;
               hitch_parts = null;
               hitch_target_parts = null;
               hitch_targets = null;
               hitch_conditional_segments = null;
               hitch_delay_function = null,
               first_hitch_target = null;
               first_hitch_attr = null;
               hitch_conditional_target = null;
               hitch_conditional_attr = null;
               hitch_conditional_or = null;
            }
        }
            
        return output;
    };
    
    //INTENT: a basic, called-from-nametag method under the guise self.create,
    //to make a nametag on the target using the given script_name, data, and server.
    var create = function(target, script_name, data, server, inner_script_flag){        
        //default data
        if(!data) data = {};
        
        //default server
        if(!server) server = "*";
        
        var script_and_server = server+'/'+script_name.toLowerCase();
        var tag = Nametag.Runtime.TemplateTagType[script_and_server] || 'div';        
        var new_element = $("<"+tag+"></"+tag+">")[0];
        
        //append it to us where it will be initialized
        target = target[0] || target;
        target.appendChild(new_element);
        
        //set the attributes that will cause the new node to be processed like a nametag
        $(new_element).addClass("nametag");
        $(new_element).attr(inner_script_flag === undefined ? "script" : "inner_script", script_name);
        $(new_element).attr("server", server);
        
        //setup a javascript attribute '_nametag_initdata' on the new div, so the creator can comminicate
        //with the createe -- if 'data' preexists on the element it will be copied to the new instance!
        //this is how data is handled in lists, so it's nice it's the same for single scripts too.
        new_element.data = data;
        
        //actually instantiate all the uninitialized nametags present at this point
        Nametag.Runtime.ExpandNametags(new_element);
        
        //return the new nametag element - the new div we made.
        return new_element;
    }
    
    /* create an item such that it is NOT added to self.items when created */
    var createUnaddedItem = function(target, script_name, data, server){
        return createItem(target, script_name, data, server, true); /* last arg makes it unadded */ 
    }
    
    //INTENT: this will use a script in the same fashion that a nametag list does;
    //it will apply the methods and setup deferred initstage calls on the top most
    //node (like the nametag list, any script used should have only 1 top most node, 
    //when using this method
    var createItem = function(target, script_name, data, server, suppressAddToItemsFlag){
        var self = this;
        
        if(!data)
            data = {};

        //parse flags that affect our operation in the data (sneaky i know)
        var startInvisible = false;
        if(data){
            //if _startInvisible is defined we'll fade the item to 0 before showing, and _startInvisible 
            //will be removed from the data so as to not pollute it.
            if(data['_startInvisible']){
                delete data['_startInvisible'];
                var startInvisible = true;
            }
        }
        
        //resolve elem
        target = target[0] || target;

        //default server
        if(!server) server = "*";

        if(script_name.indexOf("/") == -1){
            var script_and_server = server+'/'+script_name;
            var script_and_server_lower = server+'/'+script_name.toLowerCase(); 
        }else{
            var script_and_server = script_name;
            var script_and_server_lower = script_name.toLowerCase();
        }
        
        var tag = Nametag.Runtime.TemplateTagType[script_and_server_lower] || 'div';        
        var script = Nametag.Runtime.TemplateCache(script_and_server);
        
        //make the script so indicated;
        var new_element = $.tmpl(script, data || {})[0];
        var jnew_element = $(new_element);
        
        //and, of course, any data supplied
        new_element.data = data;
        
        /* provide itemlist and self to the variable replacements */
        data.self = new_element;
        
        var elementMethods = NametagClass.prototype;
            
        //setup our convience method of choice
        new_element.jnamed = elementMethods.jnamed;
        new_element.named = elementMethods.named;
        new_element.jchild = elementMethods.jchild;
        new_element.child = elementMethods.child;
        new_element.sibling = elementMethods.sibling;
        new_element.jsibling = elementMethods.jsibling;
        new_element.remove = elementMethods.remove;
        new_element.itemlist = target.nametag ? target : new_element;
            
        if(target.nametag){
            /* a list item always gets data methods. */
            var DataMethods = Nametag.Methods.Data;
            for(var key in DataMethods)
                new_element[key] = DataMethods[key];

            //if the list is selectable, add the selection methods to the item
            if(target.selectable)
                elementMethods._selectableItem(new_element);

            //the drag option will add drag methods to our nametag - uniformly applied to children.
            if(target.drag)
                elementMethods._dragItem(new_element);

            //droponchild means that not only will the container, but actually the children, be responsible for the click and 
            //depends on event bubbling...
            if(target.droponchild)
                elementMethods._dropChild(new_element);
        }
                
        //every instance of every script is given it's own css entry automatically. I found myself including it with 
        //all the widgets anyway.
        jnew_element.addClass(script_name);
        
        //if we are to startInvisible, then make us invisible
        if(startInvisible)
            jnew_element.fadeTo(0, 0);
        
        //append the new element if there is a target
        if(target){
            $(target).append(new_element);
            /* if the target has an items attribute, add the new item to it. */
            if(target.items && suppressAddToItemsFlag === undefined)
                target.items.push(new_element);
        }

        //process all newly introduced nametags below this point
        Nametag.Runtime.ExpandNametags(new_element);

        //return the new nametag element - the new div we made.
        return new_element;
    };

////////////////////////////////////////////////////////////////////////////////
// THIS IS THE ABSTRACION WE NEED TO MAKE THE APPROPRIATE NODES ON A TARGET GIVEN
// A NAMETAG THAT HAS EITHER/OR A TEMPLATE AND ANONYMOUS TEMPLATE.
////////////////////////////////////////////////////////////////////////////////

    //JQUERY Template creation is abstracted because the script/inner_script and 
    //the interactions with the Template cache are standard and so can be expressed 
    //always as the nametag we're working on, the data (a list or single item, affecting
    //the return value to be a list or single item), and the target to append to (or 
    //insertBefore as in the case of the second method here.)

    //INTENT: short hand to create a jquery script from a nametag, with those nodes
    //being made from the given data and appended to the given target.
    var createJQueryTemplateUsingNametag_andData_at = function(nametag, data, target, beforeFlag){
        //always put self in the data, for use of programmers in var replacement, etc. will have to be
        //filtered out when saving objects, but ah well.  
        
        var self = this;
        
        if(data instanceof Array)
            for(var i = 0; i < data.length ; i ++)
                data[i].self = nametag;    
                
        else if(data instanceof Object)
            data.self = nametag;
        
        //holds the output of both types of scripts
        var sum_of_both_scripts = [];
        
        //If an anonymous script is given on the nametag, use the text of it as the input and produce its nodes on the target!
        if(nametag['use_inner_script'] && nametag['inner_script']){
            var new_nodes_from_inner_script = [];
            new_nodes_from_inner_script = $.tmpl(Nametag.Runtime.TemplateCache(nametag['inner_script'], nametag['server']), data);
            
            //add in the "anonymous" script-derived nodes
            for(var i = 0; i < new_nodes_from_inner_script.length ; i ++)
                sum_of_both_scripts.push(new_nodes_from_inner_script[i]);
        }
        
        //If a script is given on the nametag, look it up and produce its nodes on the target!
        else if(nametag['script']){
            var new_nodes_from_script = [];
            new_nodes_from_script = $.tmpl(Nametag.Runtime.TemplateCache(nametag['script'], nametag['server']), data);
            
            //add in the "normal" script-derived nodes
            for(var i = 0; i < new_nodes_from_script.length ; i ++)
                sum_of_both_scripts.push(new_nodes_from_script[i]);
        }
            
        //decide if we should appendTo target or insert before target, as dictated by the beforeFlag
        
        
        if(beforeFlag === undefined)
            $(sum_of_both_scripts).appendTo(target);
        else if(beforeFlag === false)
            $(sum_of_both_scripts).prependTo(target);
        else
            $(sum_of_both_scripts).insertBefore(target);
            
        //return the total list of created items.
        return sum_of_both_scripts;
    }

    
////////////////////////////////////////////////////////////////////////////////
// PAGE READY INITIALIZATION i.e. RUN UNINITED REPLICATORS, ROUND CORNERS, ETC.
////////////////////////////////////////////////////////////////////////////////
    
    //INTENT: determine if a given class is on a node, for a pure XML object.
    //$(x).hasClass does NOT work with xml objects.
    var hasClass = function(node, classname){
        var classes = node.getAttribute('class');
        return classes && classes.split(" ").indexOf(classname) !== -1;
    }

////////////////////////////////////////////////////////////////////////////////
// HERE LIE MANY USEFUL METHODS USED IN THE CODE ABOVE, BOTH FOR EXTENDING 
// JAVASCRIPT AND JQUERY VIA PROTOTYPE AND FOR GENERAL GLOBAL USE.
////////////////////////////////////////////////////////////////////////////////

    //INTENT: return an XML evaluated jquery item insetad of the traditional HTML one.
    var ParseXML = function(xmlText){
        ////xmlText = xmlText.replace(/\n[ ]*/g, "");
        //return $.parseXML(xmlText, null).documentElement;
        
        try{ //html5
            var parser = new DOMParser();
            var xmlDoc = parser.parseFromString(xmlText, "application/xml");
            return xmlDoc.documentElement;
        }
        
        catch(e){ //IE sigh.
            //console.log("fallback to IE DOMParser (error was)", String(e));
            var xmlDoc = new ActiveXObject("Microsoft.XMLDOM");
            xmlDoc.async = "false";
            xmlDoc.loadXML(xmlText);
            return xmlDoc.documentElement;
        }
    }
    
    //INTENT: provide a way to print a node (or node list!) easily.
    //NOTE: IE HATES self-closing div tags (chrome/mozilla dont) so by placing 
    //a comment in the output we "trick" the parser into outputting a fully open-closed tag.
    var PrintXML = function(node){
        if(gettype(node) == "object"){
            var output = "";
            for(var i = 0, elem; (elem = node[i]) != undefined ; i ++)
                output += PrintXML(elem).trim();
                
            return output.trim();
        }
            
        else{
            return HTMLSerializer(node).trim();
            //return new XMLSerializer().serializeToString(node).trim() || "<!-- -->";
        }
    }
    
    //INTENT: print the xml interior to a given node.
    var PrintInnerXML = function(node){
        var output = "";
        for(var i = 0; i < node.childNodes.length ; i ++)
            output += PrintXML(node.childNodes[i]);
        
        return output;
    }
    
    //INTENT: to parse NodeLists and other jquery non-iterable iterables....
    var indexOf = function(list, item){
        for(var i = 0; i < list.length ; i ++)
            if(list[i] === item)
                return i;
        return -1;
    }

    // Credit: Jesse Ruderman as seen on https://bugzilla.mozilla.org/show_bug.cgi?id=501226
    // As edited by James Robey to eliminate xmlns support and other non-necessary tests for use in Nametag
    // This function turns an HTML DOM into either HTML or XHTML.
    // attempt to output as HTML.  (HTML enables fast-and-loose reduction, but not all DOMs can be serialized as HTML.  serializeHTML will complain about some unserializable features in HTML mode, but it won't detect things like block-in-inline and missing table parts!)
    function HTMLSerializer(n){
        // List from http://www.cs.tut.fi/~jkorpela/html/empty.html#html
        var emptyElements = {
            area: true, 
            base: true, 
            basefont: true,
            br: true, 
            col: true,
            frame: true, 
            hr: true, 
            img: true, 
            input: true, 
            isindex: true, 
            link: true, 
            meta: true, 
            param: true
        };
        
        var CDATAElements = {
            script: true,
            style: true  
        };
        
        function htmlEscape(s){
            s = s.replace(/&/g,'&amp;');
            s = s.replace(/>/g,'&gt;');
            s = s.replace(/</g,'&lt;');
            return s;
        };
        
        function quoteEscape(s){
            s = s.replace(/"/g,'&quot;');
            return s;
        };
        
        function serializeAttributes(n){
            var i, attr;
            var r = "";
            for (i = 0; attr = n.attributes[i]; ++i)
                r += " " + attr.name + "=\"" + quoteEscape(htmlEscape(attr.value)) + "\"";
            return r;
        };
        
        function hasNonTextChildren(n){
            var i, child;
            for (i = 0; child = n.childNodes[i]; ++i)
              if (child.nodeType != 3)
                return true;
            return false;
        };
        
        // uses outputXML from its closure
        function serializeSubtree(n, addXMLNSforHTML){
            switch(n.nodeType) {
                
                case 3:
                    // In XML mode, it would be "nice" to use "<![CDATA..." sometimes, but this is
                    // never incorrect.
                    return htmlEscape(n.data);
                
                case 8:
                    // Should figure out what to do with double hyphens.
                    return "<!--" + n.data + "-->";
                
                case 1: 
                    var tag = n.tagName.toLowerCase(); // XXX wrong for svg:foreignObject
                    var start = "<" + tag + serializeAttributes(n) + ">";
                    var end = "<" + "/" + tag + ">";
                    
                    var serializedChildren = "";
                    var i, child;
                    
                    for (i = 0; child = n.childNodes[i]; ++i)
                        serializedChildren += serializeSubtree(n.childNodes[i], false);
                    
                    return start + serializedChildren + end;
                
                default:
                    throw "serializeHTML: Unexpected node type " + n.nodeType + ".";
            };
        };
        
        return serializeSubtree(n || document.documentElement);
    };
    
    //Useful just to represent an empty div without extra computation. We GOTTA declare the namespace or firefox hates on us!
    var EmptyDiv = ParseXML("<div xmlns='http://www.w3.org/1999/xhtml'></div>");
    var EmptyScript = ParseXML("<script xmlns='http://www.w3.org/1999/xhtml'></script>");

//////////////////////////////////////////////////////////////////////////////
// Help javascript out - add in some stuff the list.js framework can use.
//////////////////////////////////////////////////////////////////////////////
    
    Math.bound = function(lower, upper, val){
        return Math.min(Math.max(lower, val), upper);
    };

    //I give arrays a has method. Don't that make sense?
    if(Array.prototype['has'] == undefined){
        Array.prototype.has = function(what){
            return this.indexOf(what) !== -1;
        };
    }else{
        throw new Error("Warning: tried to give array a has method, but it already has one!");
    }
    
    //I give arrays a remove method. Don't that make sense?
    if(Array.prototype['pushUniquely'] == undefined){
        Array.prototype.pushUniquely = function(what){
            if(this.indexOf(what) !== -1);
                this.push(what);
            return this;
        };
    }else{
        throw new Error("Warning: tried to give array a has method, but it already has one!");
    }

    //I give arrays a remove method. Don't that make sense?
    if(Array.prototype['remove'] == undefined){
        Array.prototype.remove = function(index){
            return this.splice(index, 1);
        };
    }else{
        throw new Error("Warning: tried to give array a remove method, but it already has one!");
    }
    
    //I give arrays an insert method. Don't that make sense?
    if(Array.prototype['insert'] == undefined){
        Array.prototype.insert = function(what, at){
          return this.splice(at, 0, what);
        };
    }else{
        throw new Error("Warning: tried to give array an insert method, but it already has one!");
    }
    
    if(Array.prototype['first'] == undefined){
        Array.prototype.first = function(default_value){
          return this[0] === undefined ? default_value : this[0];
        };
    }else{
        throw new Error("Warning: tried to give array a first method, but it already has one!");
    }
    
    //I give arrays an insert method. Don't that make sense?
    if(Array.prototype['last'] == undefined){
        Array.prototype.last = function(default_value){
          return this[this.length-1] === undefined ? default_value : this[this.length-1];
        };
    }else{
        throw new Error("Warning: tried to give array a last method, but it already has one!");
    }
    
    if(Array.prototype['each'] === undefined){
        Array.prototype.each = function(method){
            for(var i = 0; i != this.length; i ++){
                var val = method(this[i]);
                if(val !== undefined)
                    this[i] = val;
            }
                
            return this;
        };
    }else{
        throw new Error("Warning: tried to give array a each method, but it already has one!");
    }
    
    //I give strings an endswith method. Don't that make sense?
    if(String.prototype['endswith'] == undefined){
        String.prototype.endswith = function(what){
            for(var i = 0; i < arguments.length; i ++)
                if(this.slice(-arguments[i].length) == arguments[i])
                    return true;
                    
            return false;
        };
    }else{
        throw new Error("Warning: tried to give string a endswith method, but it already has one!");
    }
    
    //I give strings an startswith method. Don't that make sense?
    if(String.prototype['startswith'] == undefined){
        String.prototype.startswith = function(what){
            return what && this.length >= what.length && this.slice(0, what.length) == what;
        };
    }else{
        throw new Error("Warning: tried to give string a startswith method, but it already has one!");
    }
    
    //I give strings an startswith method. 
    if(String.prototype['startsendswith'] === undefined){
        String.prototype.startsendswith = function(what){
            return what && this.slice(0, what.length) == what && this.slice(-what.length) == what;
        };
    }
    
    else
        throw new Error("Warning: tried to give string a startsendswith method, but it already has one!");
        
    //I give strings an ltrim method.
    if(String.prototype['ltrim'] === undefined || String.prototype['rtrim'] === undefined){
        
        var _WHITESPACE_REGEX = "\x09\x0A\x0B\x0C\x0D\x20\xA0\u1680\u180E\u2000\u2001\u2002\u2003" +
            "\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u202F\u205F\u3000\u2028" +
            "\u2029\uFEFF";

        var _WHITESPACE_REGEX = "[" + _WHITESPACE_REGEX + "]";
        var trimBeginRegexp = new RegExp("^" + _WHITESPACE_REGEX + _WHITESPACE_REGEX + "*"),
            trimEndRegexp = new RegExp(_WHITESPACE_REGEX + _WHITESPACE_REGEX + "*$");
        
        String.prototype.ltrim = function(){
            return String(this).replace(trimBeginRegexp, "");
        };
        
        String.prototype.rtrim = function(){
            return String(this).replace(trimEndRegexp, "");
        };
    }
    
    else
        throw new Error("Warning: tried to give string a rtrim/ltrim method, but it already has one!");
    
    /* we will make three methods to give strings local fat API methods.
       fat returns a fat.cd(string+path_from_1st_arg) object,
       pointer returns the pointer obtained from the path from the string (plus path from 1st arg) and,
       reference does the same thing as pointer, but using reference (which does not make a path if it doesn't exist, like pointer will)*/
    
    if(String.prototype['cd'] === undefined){
        String.prototype.cd = function(path){
            return fat.cd(this+(path !== undefined ? "/"+path : ""));
        };
    }
    
    else
        throw new Error("Warning: tried to give string a fat method, but it already has one!");
    
    if(String.prototype['reference'] === undefined){
        String.prototype.reference = function(path){
            return fat.reference(this+(path !== undefined ? "/"+path : ""));
        };
    }
    
    else
        throw new Error("Warning: tried to give string a reference method, but it already has one!");
    
    if(String.prototype['pointer'] === undefined){
        String.prototype.pointer = function(path){
            return fat.pointer(this+(path !== undefined ? "/"+path : ""));
        };
    }
    else
        throw new Error("Warning: tried to give string a pointer method, but it already has one!");
    
    /* BY GIVING ARRAYS METHODS, we remove the ability to use the for var in array javascript
      syntax. indeed, across my codebase you'll only ever see the other forms.
      While the Object prototype remains totally unaltered, i decided to do this
      because methods on every array is actually quite useful, while disaster for 
      introspetion of object attributes. given i'm fine with this 'divide' between the two. */
    
    //I give arrays a copy method. Don't that make sense?
    if(Array.prototype['copy'] === undefined){
        Array.prototype.copy = function(){
            var new_list = [];
            
            for(var i = 0; i < this.length ; i ++)
                new_list.push(this[i]);
                
            return new_list;
        };
    }else
        throw new Error("Warning: tried to give array a copy method, but it already has one!");
    
    /* given array 'arr', is every member in it in the host-list? */
    if (!Array.prototype['intersect'])
        Array.prototype.intersect = function(arr){
            if(!(arr instanceof Array))
                arr = [arr];
            for(var i = 0; i < this.length ; i ++)
                for(var j = 0; j < arr.length ; j ++)
                    if(this[i] == arr[j])
                        return true;
                        
            return false;
        }
        
    else
        throw new Error("Warning: tried to give array an intersect method, but it already has one!");
    
    /* given dict 'what', find the index of the dictionary (presumed this is a list of
       dictionaries) that has all the same keys as the 'what' dict. Meant to work like indexOf for lists of dicts. */
    if(!Array.prototype['find'])
        Array.prototype.find = function(what){
            var i;
            
            for(i = 0; i < this.length ; i ++){
                var found = true;
                
                for(var key in what)
                    if(what[key] != this[i][key]){
                        found = false;
                        break;
                    }
                
                if(found)
                    return i;
            }
                
            return -1;
        }
        
    else{
        throw new Error("Warning: tried to give array an find method, but it already has one!");
    }
        
////////////////////////////////////////////////////////////////////////////////
// The fundamental superpower event mecahanism: listen, set, and unset - if used to set
// values on objects, anything listened for those atrributes will be informed
// of the change. This is as convienent to use with booleans as it is numbers
// so it's often the case that globally accessible dictionaries will thus be
// made to hold state that the applicaiton can react to when changed. It's also 
// used to say things like "the list has changed" or "the name of the script 
// to use is now". etc.
//
// listen(Nametag, "something", function(val){obj, attr, val}(alert(obj, attr, val);)
// set(Nametag, "something", "this is a test");

// this will cause an alert message to pop up with the value "this is a test", presuming 
// a dictionary called Nametag exists (i.e Nametag = {}) (which is aliased to Global where defined, but could be changed...)
////////////////////////////////////////////////////////////////////////////////
    
    //I will pair a method to an attribute on a given object such that if the set function 
    //is called to change that attribute the method will be called with the object changed and the attr's new value
    //the boundobject parameter can specify an object that will receive a release() method
    //so that any registrations made will be unmade when boundobject.release() is called!
    function listen(obj, attrlist, method, context, boundobject){
        
        /* listening to undefined is badbadbad.  */
        if(!(obj instanceof Object))
           throw "A non-object was passed to listen for the attribute \""+attr+"\" and is an error. Object: "+String(obj)+".";
            
        /* if they give a boundobject, initialize it if not already */
        if(boundobject !== undefined){            
            if(boundobject['__attributesListened__'] === undefined)
                boundobject['__attributesListened__'] = [];
            
            if(boundobject.release === undefined)
                boundobject.release = _releaseListens;
        }
            
        /* if they pass a single string, make it a list */
        attrlist = stringToList(attrlist);
        
        var releaselist =  [];
            
        for(var i = 0; i < attrlist.length ; i ++){
            var attr = attrlist[i];
            
            if(obj.__listenedAttributes__ === undefined)  
                obj.__listenedAttributes__ = {};

            if(obj.__listenedAttributes__[attr] === undefined)  
                obj.__listenedAttributes__[attr] = new Array;

            obj.__listenedAttributes__[attr].push([method, context]);   
              
            releaselist.push([
                obj, attr, method, context, boundobject
            ]);
        }
        
        /* if they provide a bound object, push the release list onto it. */
        if(boundobject)
            boundobject.__attributesListened__.extend(releaselist);
        
        return releaselist;
    }
    
    /* INTENT: the listen method returns a list that if kept can be passed to this to release only
       what was created in that listen call */
    function release(releaselist){
        for(var i = 0; i < releaselist.length ; i ++){
            var entry = releaselist[i];
            var obj = entry[0], attr = entry[1], method = entry[2], context = entry[3], boundobject = entry[4];
            
            /* use that information to find the registration (going backwards) removing them. */
            var listened_list = obj.__listenedAttributes__[attr] || [];
            
            for(var j = listened_list.length-1; j != -1; j --)
                if(listened_list[j][0] == method && listened_list[j][1] == context){
                    listened_list.remove(j);
                    if(listened_list.length == 0)
                        delete obj.__listenedAttributes__[attr];
                    break;
                } 
                
            if(boundobject){
                var listening_list = boundobject.__attributesListened__ || [];
                
                for(var j = listening_list.length-1; j != -1; j --){
                    if(listening_list[j][0] == obj && listening_list[j][1] == attr && listening_list[j][2] == method){
                        listening_list.remove(j);
                        break;
                    }
                }
            }
        }
    }
    
    /* this method will be assigned to boundobjects specified when listening events.
    when this method is called on that boundobject, all registrations bound will be released! */
    function _releaseListens(){
        var attrs_setup_list = this.__attributesListened__ || [];
        
       /* for all the recorded registrations-to-remove */
        for(var i = this.__attributesListened__.length-1; i >= 0; i --){
            var obj = this.__attributesListened__[i][0];
            var attr = this.__attributesListened__[i][1];
            var method = this.__attributesListened__[i][2];
            
            /* use that information to find the registration (going backwards) removing them. */
            var listened_list = obj.__listenedAttributes__[attr] || [];
            
            for(var j = listened_list.length-1; j >= 0; j --)
                if(listened_list[j][0] == method){
                    obj.__listenedAttributes__[attr].remove(j);
                    if(obj.__listenedAttributes__[attr].length == 0)
                        delete obj.__listenedAttributes__[attr];
                    break;
                }   
                
            /* remove the entry as we empty it -- reset() requires this although remove() would have dumped this anyway. */
            this.__attributesListened__.remove(i);
        }
    }
    
    /* INTENT: not only listen, but fire the method right away to evaluate first state */
    function listenNow(obj, attrlist, method, context, boundobject){
        listen(obj, attrlist, method, context, boundobject);
        
        /* cast the attr list to list if not already (i.e. comma sep to list) */
        attrlist = stringToList(attrlist);
            
        for(var i = 0; i < attrlist.length ; i ++)
            method.call(context || this, obj[attrlist[i]]);
    }

    /* I will set a attribute on an obj such that any methods listened via the listen() method will fire. */
    function send(obj, attr, val){ 
        if(val === undefined) val = obj[attr]; /* if no val given use current val of object */
        
        /* we look at the raw arguments coming in 
           to decide if we've been given one or more then
           one value, and so to either .call or .apply this
           value(s) below */
        var args = Array();
        for(var i = 0; i < arguments.length ; i ++)
            args.push(arguments[i]);
        
        /* determine if we have args to use or not. is either
           the list of arguments to send or false */
        args = args.length > 3 ? args.slice(2) : false;
        
        /* if there are no listeners, just return. */
        if(!obj.__listenedAttributes__ || !obj.__listenedAttributes__[attr])
            return;
        
        /* get a reference to the listeners list */
        var regAttrs = obj.__listenedAttributes__[attr];
        
        /* it is CRUCIALLY important to the listening algorithm that one cache the entries to 
           call BEFORE calling them in sequence, as they may alter this list during their execution 
           and while we want that, it means we must rely on a second list to iterate over everything
           correctly! */
        
        var to_run = [];   
        for(var i = 0; i < regAttrs.length; i ++)
            to_run.push([regAttrs[i][0], regAttrs[i][1]]);
            
        /* if we are not applying the value, call the method with a single argument */
        if(args === false){
            for(var i = 0; i < to_run.length; i ++)
                if(to_run[i][0])
                    to_run[i][0].call(to_run[i][1] ? to_run[i][1] : obj, val, obj, attr);
        }
        
        /* if we ARE being told to apply the value (via the applyValFlag), we will use
           the list-val as the arguments to use in an .apply call. */
        else{
            for(var i = 0; i < to_run.length; i ++)
                if(to_run[i][0])
                    to_run[i][0].apply(to_run[i][1] ? to_run[i][1] : obj, args);
        }   
    }
    
    /* EXACTLY like send() except that if the current val of obj.attr is a function, it will be called with 
          the sent value, a very common pattern. */
    function fire(obj, attr, val){ 
        if(val === undefined) val = obj[attr]; /* if no val given use current val of object */
    
        /* we look at the raw arguments coming in 
           to decide if we've been given one or more then
           one value, and so to either .call or .apply this
           value(s) below */
        var args = Array();
        for(var i = 0; i < arguments.length ; i ++)
            args.push(arguments[i]);
    
        /* determine if we have args to use or not. is either
           the list of arguments to send or false */
        args = args.slice(2);
        
        /* if a function exists of that name run it. if it returns false, return that and DONT do any sends  */
        var retval;
        if(gettype(obj[attr]) == 'function')
            retval = obj[attr].apply(obj, args);
    
        if(retval === false)
            return false;
    
        /* if there are no listeners, just return the retval. */
        if(!obj.__listenedAttributes__ || !obj.__listenedAttributes__[attr])
            return retval;
    
        /* get a reference to the listeners list */
        var regAttrs = obj.__listenedAttributes__[attr];
    
        /* it is CRUCIALLY important to the listening algorithm that one cache the entries to 
           call BEFORE calling them in sequence, as they may alter this list during their execution 
           and while we want that, it means we must rely on a second list to iterate over everything
           correctly! */
    
        var to_run = [];   
        for(var i = 0; i < regAttrs.length; i ++)
            to_run.push([regAttrs[i][0], regAttrs[i][1]]);
    
        /* if we are not applying the value, call the method with a single argument */
        if(args.length){
            for(var i = 0; i < to_run.length; i ++)
                if(to_run[i][0])
                    to_run[i][0].call(to_run[i][1] ? to_run[i][1] : obj, val, obj, attr);
        }
    
        /* if we ARE being told to apply the value (via the applyValFlag), we will use
           the list-val as the arguments to use in an .apply call. */
        else{
            for(var i = 0; i < to_run.length; i ++)
                if(to_run[i][0])
                    to_run[i][0].apply(to_run[i][1] ? to_run[i][1] : obj, args);
        }  
    
        return retval; 
    }
    
    /* I will set a attribute on an obj such that any methods listened via the listen() method will fire. */
    function set(obj, attr, val){
        /* do the actual assignment */
        obj[attr] = val;
        
        var args = Array();
        for(var i = 0; i < arguments.length ; i ++)
            args.push(arguments[i]);
        
        /* call an event on this attr using .apply*/
        if(args.length > 3){
            args = args.slice(2);
            args.insert(obj, 0);
            args.insert(attr, 1);
            send.apply(this, args);
        }
            
        /* else do a normal call with .call getting val (only) */
        else
            send(obj, attr, val);
        
        /* return the new value of the attr, which may have changed during set! */
        return obj[attr];
    }
    
    function toggle(obj, attr){
        return set(obj, attr, !obj[attr]);
    }
    
    /* unset an attribute by passing undefined as the value. */
    var unset = function(obj, attr){
        set(obj, attr);
    }
    
    /* INTENT: called by file machinery ONLY, this properly 
       issues events for a path, without relying  */
    var conditionalSend = function(obj, attr, custom_function){        
        if(!obj.__listenedAttributes__ || !obj.__listenedAttributes__[attr])
            return;
        
        var listeners = obj.__listenedAttributes__[attr] || [];
        
        /* it is CRUCIALLY important to the listening algorithm that one cache functions to call in a list before evaluating them */
        var to_run = [];
        for(var j = 0; j < listeners.length; j ++)
            to_run.push([listeners[j][0], listeners[j][1]]);
        
        /* for each entry, if they explicitly return false, stop and return */
        
        try{
            for(var j = 0; j < to_run.length ; j ++)
                if(to_run[j][0] && (custom_function(to_run[j][0], to_run[j][1]) === false))
                    return false;
                    
        }catch(err){
            return false;
        }
                
        return;
    }
    
////////////////////////////////////////////////////////////////////////////////
// Lets spruce jquery up a bit:
////////////////////////////////////////////////////////////////////////////////

    //function used to construct traversal API by making methods to return the value of running this.
    //NOTE THIS FUNCTION is a tool used internally by the .named/.child/.sibling series of dom navigation
    //methods available on nametags
    
    var _traversalFunction = function(target, initialOperation, names, returnJQObjFlag, suppress_no_name_error){    
        names = names.split(".");
        
        //handle . tagtype
        var tagtype = ""; //undef eq. any
        if(names[0].indexOf(".") !== -1){
            var parts = names[0].split(':');
            tagtype = parts[0];
            names[0] = parts[1];
        }

        //always add the single name they pass
        var whereto = [[initialOperation, names[0], tagtype]];

        //and if they give more pieces (slash seperated names)
        for(var i = 1; i < names.length ; i ++){        
            //normal mode = child
            var mode = 0;
            
            //if mode == named - i.e. an empty item between two slashes - note it and increement i, continue.
            if(names[i].length === 0){
                mode = 1;
                ++i;
            }
            
            //handle . tagtype
            var tagtype = ""; //undef eq. any
            if(names[i].indexOf(".") !== -1){
                var parts = names[i].split('.');
                tagtype = parts[0];
                names[i] = parts[1];
            }
            
            //put sibling aside for adding after this one
            var sibling = undefined;
            if(names[i].indexOf(":") !== -1){
                var parts = names[i].split('|');
                names[i] = parts[0];
                sibling = parts[1];
            }
            
            //add the primary new parameter - operation type, name, and tagtype of next jump in dom tree
            whereto.push([mode, names[i], tagtype]);
            
            //if we had a sibling put aside from above add it after the first item.
            if(sibling){
                var tagtype = ""; //undef eq. any
                
                if(sibling.indexOf(".") !== -1){
                    var parts = sibling.split(':');
                    tagtype = parts[0];
                    sibling = parts[1];
                }
                
                whereto.push([2, sibling, tagtype]);
            }
        }

        //we've built a list of operations to perform, do them.
        for(var i = 0; i < whereto.length ; i ++){
            var entry = whereto[i];
            
            //if child  
            if(entry[0] === 0)
                target = target.children(entry[2]+" [name="+entry[1]+"]");
                
            //else named
            else if(entry[0] === 1)
                target = target.find(entry[2]+" [name="+entry[1]+"]");
                
            //else sibling
            else if(entry[0] === 2)
                target = target.parent().children(entry[2]+" [name="+entry[1]+"]");
            
            if(target[1])
                throw "traversal over "+names+" returned more then one node named '"+entry[2]+' '+entry[1]+"' in:\n\n"+PrintXML(target);
            else if(!target)
                throw "traversal over "+names+" returned no nodes node named '"+entry[2]+' '+entry[1]+"' in:\n\n"+PrintXML(target);
        }
        
        var to_return = returnJQObjFlag ? target : target[0];
        
        if(!suppress_no_name_error && !to_return){
            var mode_names = ['child', 'named', 'sibling'];
            throw "We tried to find something "+mode_names[initialOperation]+" '"+names+"' returned nothing, in:\n\n"+PrintXML(target);
        }
            
        //if we are returning jq object just return, else return just element
        return to_return;
    }
    
    //return a node interior to ourselves named 'name'. This is quicker then looking 
    //for id's as well as being factorable.
    if($.fn['child']) throw new Error("$.fn['child'] already defined! (nametag.js trying to redefine it)");
    $.fn.child = function(names){
        return _traversalFunction(this, 0, names, false, false);
    }

    //return a node interior to ourselves named 'name'. This is quicker then looking 
    //for id's as well as being factorable.
    if($.fn['named']) throw new Error("$.fn['named'] already defined! (nametag.js trying to redefine it)");
    $.fn.named = function(names){
        return _traversalFunction(this, 1, names, false, false);
    }
    
    //return a node interior to ourselves named 'name'. This is quicker then looking 
    //for id's as well as being factorable.
    if($.fn['sibling']) throw new Error("$.fn['named'] already defined! (nametag.js trying to redefine it)");
    $.fn.sibling = function(names){
        return _traversalFunction(this, 2, names, false, false);
    }
    
    //return a node interior to ourselves named 'name'. This is quicker then looking 
    //for id's as well as being factorable.
    if($.fn['jchild']) throw new Error("$.fn['child'] already defined! (nametag.js trying to redefine it)");
    $.fn.jchild = function(names){
        return _traversalFunction(this, 0, names, true, false);
    }

    //return a node interior to ourselves named 'name'. This is quicker then looking 
    //for id's as well as being factorable.
    if($.fn['jnamed']) throw new Error("$.fn['named'] already defined! (nametag.js trying to redefine it)");
    $.fn.jnamed = function(names){
        return _traversalFunction(this, 1, names, true, false);
    }
    
    //return a node interior to ourselves named 'name'. This is quicker then looking 
    //for id's as well as being factorable.
    if($.fn['jsibling']) throw new Error("$.fn['named'] already defined! (nametag.js trying to redefine it)");
    $.fn.jsibling = function(names){
        return _traversalFunction(this, 2, names, true, false);
    }
    
    //return a node interior to ourselves named 'name'. This is quicker then looking 
    //for id's as well as being factorable.
    if($.fn['hasChild']) throw new Error("$.fn['hasChild'] already defined! (nametag.js trying to redefine it)");
    $.fn.hasChild = function(names){
        return _traversalFunction(this, 0, names, false, true);
    }

    //return a node interior to ourselves named 'name'. This is quicker then looking 
    //for id's as well as being factorable.
    if($.fn['hasNamed']) throw new Error("$.fn['hasNamed'] already defined! (nametag.js trying to redefine it)");
    $.fn.hasNamed = function(names){
        return _traversalFunction(this, 1, names, false, true);
    }
    
    //return a node interior to ourselves named 'name'. This is quicker then looking 
    //for id's as well as being factorable.
    if($.fn['hasSibling']) throw new Error("$.fn['hasSibling'] already defined! (nametag.js trying to redefine it)");
    $.fn.hasSibling = function(names){
        return _traversalFunction(this, 2, names, false, true);
    }
    
    //make it easy to get/set top
    if($.fn['top']) throw new Error("$.fn['top'] already defined! (nametag.js trying to redefine it)");
    $.fn.top = function(val){
        return val !== undefined ?
            this.css("top", "px%".indexOf(String(val).slice(-2)) === -1 ? String(val)+"px" : val) :
            parseInt(this.css("top").slice(0, -2), 10);
    }
    
    //make it easy to get/set left
    if($.fn['left']) throw new Error("$.fn['top'] already defined! (nametag.js trying to redefine it)");
    $.fn.left = function(val){
        return val !== undefined ?
            this.css("left", "px%".indexOf(String(val).slice(-2)) === -1 ? String(val)+"px" : val) :
            parseInt(this.css("left").slice(0, -2), 10);
    }
    
    //make it easy to get/set top
    if($.fn['bottom']) throw new Error("$.fn['bottom'] already defined! (nametag.js trying to redefine it)");
    $.fn.bottom = function(val){
        return val !== undefined ?
            this.css("bottom", "px%".indexOf(String(val).slice(-2)) === -1 ? String(val)+"px" : val) :
            parseInt(this.css("bottom").slice(0, -2), 10);
    }
    
    //make it easy to get/set left
    if($.fn['right']) throw new Error("$.fn['right'] already defined! (nametag.js trying to redefine it)");
    $.fn.right = function(val){
        return val !== undefined ?
            this.css("right", "px%".indexOf(String(val).slice(-2)) === -1 ? String(val)+"px" : val) :
            parseInt(this.css("right").slice(0, -2), 10);
    }
    
    //make it easy to get/set opacity
    if($.fn['opacity']) throw new Error("$.fn['top'] already defined! (nametag.js trying to redefine it)");
    $.fn.opacity = function(val){
        return val !== undefined ?
            this.css("opacity", val) :
            parseFloat(this.css("opacity"));
    }
    
    //make it easy to get/set left
    if($.fn['zindex']) throw new Error("$.fn['zindex'] already defined! (nametag.js trying to redefine it)");
    $.fn.zindex = function(val){
        return val !== undefined ?
            this.css("z-index", val) :
            this.css("z-index");
    }

    if($.fn['reverse']) throw new Error("$.fn['reverse'] already defined! (nametag.js trying to redefine it)");
    //allow to reverse the order of nodes in a chain of jquery calls. neat.
    $.fn.reverse = function() {
        this.pushStack(this.get().reverse());
        return this;
    }
    
    //simply cause a div to scroll to the bottom given a selector.
    if($.fn['scrollToBottom']) throw new Error("$.fn['scrollToBottom'] already defined! (nametag.js trying to redefine it)");
    $.fn.scrollToBottom = function(){
        this.animate({scrollTop: $(this).prop("scrollHeight")}, Nametag.GUI.duration);
    }
    
    //simply cause a div to scroll to the bottom given a selector.
    if($.fn['scrollToTop']) throw new Error("$.fn['scrollToTop'] already defined! (nametag.js trying to redefine it)");
    $.fn.scrollToTop = function(){
        this.animate({scrollTop:0}, Nametag.GUI.duration);
    }
    
    if($.fn['scrollTo']) throw new Error("$.fn['scrollToTop'] already defined! (nametag.js trying to redefine it)");
    $.fn.scrollTo = function(y, noanimFlag){
        var self = this[0];
        
        this.animate({scrollTop:y}, noanimFlag !== undefined ? 0 : Nametag.GUI.duration);
        /* tell listeners we scrolled - since if we scroll by the above mousewheel events dont seem to fires */
        
        set(self, 'scrolledTo', y);
    }
    
    if($.fn['singleclick']) throw new Error("$.fn['singleclick'] already defined! (nametag.js trying to redefine it)");
    /* singleclick means only when they mousedown and mouseup in the same place.  */
    $.fn.singleclick = function(onclick, ondblclick){
        var self = this[0];
        self._single_click_state = false;
        self._single_click_mouseclicks = 0;
        self._single_click_upevent = false;
        
        
        $(self).mousedown(function(e){
            
            //if there is no double click or drag, we can activate right away
            if(self.__dblclick__ || self.drag)
                onclick.call(self, e);
            
            else{
                e.offsetX = (e.offsetX != null) ? e.offsetX : e.originalEvent.layerX;
                e.offsetY = (e.offsetY != null) ? e.offsetY : e.originalEvent.layerY;

                self._single_click_mouseclicks += 1;
                self._single_click_state = {
                    x:e.offsetX, 
                    y:e.offsetY
                };

                if(self._single_click_mouseclicks == 2){
                    clearTimeout(self._single_click_timer);

                    /* if there is at least one up event, and there have only been one mousedown, and the z/y haven't changed, it's a single click. whew. */
                    Math.abs(self._single_click_state.x-self._single_click_upevent.offsetX) < 4 &&
                    Math.abs(self._single_click_state.y-self._single_click_upevent.offsetY) < 4 &&
                    ondblclick.call(self, e);

                    self._single_click_mouseclicks = 0;
                    self._single_click_upevent = false;
                }

                else{
                    /* if this has not fired by a */
                    self._single_click_timer = setTimeout(function(){
                        /* if there is at least one up event, and there have only been one mousedown, and the z/y haven't changed, it's a single click. whew. */
                        self._single_click_upevent && 
                        self._single_click_mouseclicks == 1 && 
                        Math.abs(self._single_click_state.x-self._single_click_upevent.offsetX) < 4 &&
                        Math.abs(self._single_click_state.y-self._single_click_upevent.offsetY) < 4 &&
                        onclick.call(self, e);

                        //Nametag.Debugger.warning("Cannot return true with singleclick. When singleclick listens to an element, it uses a delay to distinguish clicks from double clicks and drags. This delay then removes our chance to return true or false right away, thus, singleclick always returns false. This is a convienence warning for you.");

                        self._single_click_mouseclicks = 0;
                        self._single_click_upevent = false;
                    }, Nametag.Runtime.doubleClickDelay+1);
                }
            }
            
            
            /* return true? Yes - we cannot know it's a click until the timeout happens, and so if we did not do this
               events related to dragging would not get a chance to fire (keyed on mousedown). Also, this allows input
               fields to get clicks in the Finderer, for instance, where they would otherwise be eaten */
            return true;
        });
        
        /* while mousedown MUST be allowed to drop through, if we did the same for mouseup, we'd not be able
           to "trap" mouseevents at a certain component. Drag drop utilizes mousedown so it will work harmoniously,
           while all other singleclick handlers will never get mouseup so they will be trapped here. good. */
        $(self).mouseup(function(e){
            e.offsetX = (e.offsetX != null) ? e.offsetX : e.originalEvent.layerX;
            e.offsetY = (e.offsetY != null) ? e.offsetY : e.originalEvent.layerY;
            self._single_click_upevent = e;
            return true;
        });
    }
    
    //if($.fn['scale']) throw new Error("$.fn['scale'] already defined! (nametag.js trying to redefine it)");
    //$.fn.scale = function(to){
    //    return $(this).css("scale", to);
    //}
    //
    //if($.fn['rotate']) throw new Error("$.fn['scale'] already defined! (nametag.js trying to redefine it)");
    //$.fn.rotate = function(to){
    //    return $(this).css("rotate", to);
    //}
    
    //This both derefernces and pretties a seletor result made from a JQ call
    //if it resolves to one element and returns a real array of elements otherwise.g
    var $$ = function(selector){
        var output = $.makeArray($(selector));
        return (output.length == 1) ? output[0] : output;
    }
    
    if(typeof String.prototype.trim !== 'function') {
      String.prototype.trim = function() {
        return this.replace(/^\s+|\s+$/g, ''); 
      }
    }
    
////////////////////////////////////////////////////////////////////////////////
// USEFUL UTILITIES
////////////////////////////////////////////////////////////////////////////////

    //I am some cool shorthand for returning "obj", "array", "string", etc as needed.
    //I do not differentiate between different objs (as instanceof does) just different types.
    var gettype = function(obj){
      return ({}).toString.call(obj).match(/\s([a-zA-Z]+)/)[1].toLowerCase();
    }
    
    //INTENT: I will return a list of keys from an obj or obj
    var getkeys = function(dict){
        var keys = new Array;
        try{
            for(var o in dict)
                keys.push(o);
        }catch(err){
            return ["BAD KEY IN GETKEYS"];
        }   
            
        return keys;
    }
    
    //INTENT: take a comma sep list and return an array
    var stringToList = function(buf, delim){
        //if no delim given use ','
        if(delim === undefined) 
            delim = ",";
        
        if(!buf) return [];
        var output = [];
        var comma_sep_list = String(buf).split(delim);
        
        while(comma_sep_list.length){
            //detect and skip empty segments
            var entry = comma_sep_list.shift().trim();
            if(entry)   
                output.push(entry);
        }

        return output;
    }
    
    //INTENT: return a listing of all attribute on an object - debugging.
    //this has been enhanced to recurse one level deep, so that the attributes of the dir(x) object
    //are also listed. nice.
    var dir = function(obj, dontexpand){
        //make header
        var output = "";
        
        if(dontexpand === undefined){
            output += "Repr: "+obj+"\n";
            
            if(!(obj instanceof Array)){
                output += "\nAttributes: ";
                for(var key in obj)
                    output += key+", ";
                output += "\n";
            }
                
            output += "\nContents:\n";   
        }
        
        if(obj instanceof Array && obj.length == 0)
            output += "(previous is empty array)\n";
            
        else if(obj instanceof Array)
            for(var i = 0; i < obj.length ; i ++){
                var val = obj[i] == 'function' ? "[FUNCTION]" : obj[i];
                
                //we may not be able to coerce to value. say so when that exception happens.
                try{
                    val = (gettype(val) == 'string' && val.length > 50) ? (val.substr(0, 50).replace('\n', '') + " [...]") : val;
                    output += (dontexpand!==undefined ? "        " : "") + i + ') = ' + val + "\n";
                }catch(err){
                    output += (dontexpand!==undefined ? "        " : "") + i + ') = (cant convert)\n';
                }
                
                if(dontexpand === undefined)
                    if(obj[i] instanceof Array || obj[i] instanceof Object) 
                        output += dir(obj[i], true);
            }
          
        else if(obj instanceof Object && getkeys(obj).length == 0)
            output += "(previous is empty dictionary)\n";
          
        else if(obj instanceof Object)
            for(var key in obj){
                var val = gettype(obj[key]) == 'function' ? "[FUNCTION]" : obj[key];
                
                //we may not be able to coerce to value. say so when that exception happens.
                try{
                    val = (gettype(val) == 'string' && val.length > 50) ? (val.substr(0, 50).replace('\n', '') + " [...]") : val;
                    output += (dontexpand!==undefined ? "        " : "") + key + ' = ' + val + "\n";
                }catch(err){
                    output += (dontexpand!==undefined ? "        " : "") + key + ' = (cant convert)\n';
                }    
                
                if(dontexpand === undefined || key == 'obj')
                    if(obj[key] instanceof Array || obj[key] instanceof Object || key == 'obj') 
                        output += dir(obj[key], true);
            }
        
        else
            output += "...is of type " + gettype(obj).toUpperCase();
            
        return output;
    }
        
    //INTENT: to do simple logic in jquery scripts
    var iftest = function(what, t, f){
        return what ? t : f;
    };
    
    var lessthan = function(a, b){
        return a < b;
    };
    
    var greaterthan = function(a, b){
        return a > b;
    };
    
    /* do a shallow copy of something */
    var copy = function(source, dest){
        if(!source)
            return dest; 
            
        if(gettype(source) == "string")
            return String(source);
            
        if(gettype(source) == "number")
            return Number(source);
        
        if(dest === undefined)
            dest = source instanceof Array ? [] : {};
            
        if(source instanceof Array){
            for(var i = 0; i < source.length ; i ++)
                dest[i] = source[i];
        }
        
        else if(source instanceof Object){
            for(var key in source)
                dest[key] = source[key];
        }
            
        return dest;
    };
    
    /* I am a way in which any type of json object (str, num, dict, array) will be 
       returned as a deep copy. this is preferable to putting a .copy method on Object
       although Array.copy does exist), and so is quite convienent. */
    function deepcopy(source, dest){
        if(gettype(source) == "string")
            return String(source);
            
        if(gettype(source) == "number")
            return Number(source);
        
        if(dest === undefined)
            dest = source instanceof Array ? [] : {};
            
        return $.extend(true, dest, source);
    };
    
    
    //INTENT: shorthand to copy values from one dict onto a second, if it doesn't already exist.
    var safecopy = function(source, dest){
        if(dest === undefined)
            dest = {};
            
        if(source)
            for(var key in source)
                if(!dest[key])
                    dest[key] = source[key];
        return dest;
    };
    
    var elementcopy_non_safe_attrs = ['class', "style", 'xmlns', "__listenedAttributes__", "__attributesListened__"];
    
    //INTENT: shorthand to copy values from one dict onto a second except those that are 
    //illegal (security exception) for an html element to have altered
    var elementcopy = function(source, dest){
        if(dest === undefined)
            dest = {};
            
        if(source)
            for(var key in source)
                if(elementcopy_non_safe_attrs.indexOf(key) === -1)
                    dest[key] = source[key];
                
        return dest;
    }
    
    /* this just tests objects for value equality, stored on $ for convenience (why not?) */
    var valuesAreEqual = function(a, b){
        for(p in a)
            if(typeof(b[p])=='undefined')
                return false;
        
        for(p in a) {
            if (a[p]) {
                switch(typeof(a[p])) {
                    case 'object':
                        if (!a[p].equals(b[p])) { return false; } break;
                    case 'function':
                        if (typeof(b[p])=='undefined' ||
                            (p != 'equals' && a[p].toString() != b[p].toString()))
                            return false;
                        break;
                    default:
                        if (a[p] != b[p]) { return false; }
                }
            }
            
            else
                if (b[p])
                    return false;
        }
        
        for(p in b)
            if(typeof(a[p])=='undefined')
                return false;
        
        return true;
    }
    
    function getTextFromFirstChild(el){
        var result;
        $(el).contents().each(function(){
            if(result = $.trim($(this).text()))
                return false;
        });
        return result;
    }
    
    /* INTENT: return a name representing the passed object, checking for and 
    choosing the best way as possible */
    var debuggingId = function(buf){
        if(buf === undefined)
            return "UNDEFINED.";
        
        /* if it's a string, then it's a selector still, deal with it. */
        buf = $(buf);
        
            
        if(buf.attr('id')) 
            return 'ID: '+buf['id'];
            
        if(buf.attr('name')) 
            return 'NAME: '+buf['name'];
            
        if(buf[0] && buf[0]['nametag']){
            if(buf[0].nametag['script']) 
                return 'USING TEMPLATE: '+buf[0].nametag['script'];
        }
        
        /* if nothing else, return  */
        return "HTML: "+buf.html();
    };
        
    function encode_utf8( s ){
        return unescape(encodeURIComponent(s));
    }

    function decode_utf8( s ){
        return decodeURIComponent(escape(s));
    }

    /* INTENT: abstract the JSHINT mechanism to check dictionaries, as is the format for code in nametag applications */
    function checkDictionaryForErrors(text_to_eval, allowSlashComments){
        text_to_eval = "var the_dict_to_test = "+text_to_eval+";";
        
        /* As a first step, if there are any double-slash comments, with any preceding whitespace, report that we can't use double-slash comments, but must use slash-star comments in all nametag text */
        if(!allowSlashComments && text_to_eval.match(/\s+\/\//g))
            throw "You cannot use // style comments in nametag code blocks! You must use slash-star style comments, as a side effect of the HTML DOM parser. (DOMParser iteself does allow // but a rule was indicated.) \n\nIn the code block:\n\n"+text_to_eval;
            
        /* Now run the code block through JSHINT: */
        var result = JSHINT(text_to_eval, {sub:true, loopfunc:true, multistr:true, laxcomma:false, shadow:true, onevar:false, evil:true, expr:true, funcscope:false});

        /* if the result is false this logic will assemble an error report: */
        if(!result){
            var error_message = "";
            var error = JSHINT.errors[0];
            error_message += error.reason + ', line ' + error.line + ', char ' + error.character + "\n";
            
            /* show the area around the error: */
            if(error.character > 80)
                error_message += "\n\nThe error occurred around: \n\n"+text_to_eval.slice(Math.max(0, error.character-40), Math.min(text_to_eval.length, error.character+40));//+"\n\nAnd the full listing is: \n\n";
            
            /* convert whatever block of code there is into the same code with line numbers. WARNING can throw off character counts if you have only one long line (like this one:) */
            //var text_block_with_line_numbers = "";
            //var text_block_split_up = text_to_eval.slice(23).split("\n");
            //for(var i = 0; i < text_block_split_up.length ; i ++)
            //    text_block_with_line_numbers += (i+1)+": "+text_block_split_up[i] + "\n";
            //
            //error_message += text_block_with_line_numbers;
            
            return error_message;
        }
        
        return false;
    }
    
    /* MY god.. the only way to get POST to work with JSON is to do it over and over, until it works! The major 
    issue was that sending a pure json req. back to the server was very, very, VERY buggy - it worked 50% of the time!
    What in the hell works 50% of the time?! anyway, the solution is to divide a JSON dict into it's constituent keys,
    use those keys when contructing the request, and have the value of each key be the json value of that key. 
    This is then reconstructed, on the server, to get the originally sent dict passed to this method. 
    WHEW! It drove me mad, figuring this out, but in the end the code took 20 min. to write. (see json_payload below). Typical.
    */
    var post = function(options){
        
        var url = options.url;
        var data = options.data;
        var success = options.success;
        var error = options.error;
        var async = options.async || false;
        var preprocess_success = options.preprocess_success;
        
        success = success !== undefined ? success : function(){};
        
        //make sure data is a list
        if(!(data instanceof Array))
            data = [data];
        
        //The important part - split the data up into the top level dictionaries, each who's keys are
        //converted to json then back again.
        var json_payload = {'objs':[]};
        
        for(var i = 0; i < data.length ; i ++){
            var entry = {};
            for(var key in data[i])
                entry[key] = JSON.stringify(data[i][key]);
            json_payload['objs'].push(entry);
        }
        
        //INTENT: what to do when a request succeeds! 
        var successwrapper = function(data, status){
            //normal process of dealing with information from the server on success
            
            if(data['error'] || !data){
                alert(data['error']);
                if(error)
                    error(data);
                return true;
            }
            
            //if a preprocess_success function was given, run it and use the returned result as the data to use.
            //if the preprocess_success function returns false, dont do anything else.
            if(preprocess_success){
                data = preprocess_success(data, status);
                if(!data) return false;
            }
            
            //success!!
            if(success)
                success(data['objs'] || data, status);
            
            //... and a message? If so, display it after the logic for the return values
            //presuming that its much less then the time 
            if(data['msg'])
                alert(data['msg']);
            
            return true;
        }
            
        //INTENT: when complete, if in error, tell the user.
        var completewrapper = function(xhr){
            
            //no response? bail.
            if(xhr['status'] != 200 && !xhr['responseText']){
                //alert("There was no response from the server when contacting the url "+url+". The server might be down or unreachable. Are you sure you have internet access?");
                if(error)
                    error(url, data);
                return false;
            }
            
            return true;
        };
        
        /* if the url starts with // then we know the first part is a domain */
        if(url.slice(0, 2) == '//')
            url = "http:"+url;

        /* or, if there is no http, interpret the path as absolute against the originating
           server */
        else if(url.indexOf("://") === -1)
            url = url[0] == '/' ? 
                "http://"+Nametag.Trust.server+url : 
                "http://"+Nametag.Trust.server+'/'+url;
                
        try{
            //INTENT: now that our data is all setup, make the actual (possibly cross server) request
            return $.ajax({
                url:encodeURI(url),
                type:'POST',
                cache:false,
                data:json_payload,
                dataType:'json',
                async:async, /* async , while in a normal web page decreasing load time, imposes callback patterns with programming that are generally not worth it. */
                success:successwrapper,
                complete:completewrapper,
                error:function(){
                    if(error) error(url);
                }
            });
        }
        
        catch(err){
            console.log("post() failed to load "+url+". Error was "+String(err));
            if(error)
                error(url);
            return false;
        }
    }
    
    //INTENT: make it easier to measure and change css pixel values
    var returnCSSWidthOfElementAsInt = function(element){
        var amount_text = $(element).css('width');
        return parseInt(amount_text.substr(0, amount_text.length-2));
    }
    
    /* 
        Base64: pulled from a stackoverflow.com post, with updates were by others, here merged.
     */
    var Base64 = {
        // private property
        _keyStr : "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",

        // public method for encoding
        encode : function (input) {
            var output = "";
            var chr1, chr2, chr3, enc1, enc2, enc3, enc4;
            var i = 0;

            input = Base64._utf8_encode(input);

            while (i < input.length) {

                chr1 = input.charCodeAt(i++);
                chr2 = input.charCodeAt(i++);
                chr3 = input.charCodeAt(i++);

                enc1 = chr1 >> 2;
                enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);
                enc3 = ((chr2 & 15) << 2) | (chr3 >> 6);
                enc4 = chr3 & 63;

                if (isNaN(chr2)) {
                    enc3 = enc4 = 64;
                } else if (isNaN(chr3)) {
                    enc4 = 64;
                }

                output = output +
                Base64._keyStr.charAt(enc1) + Base64._keyStr.charAt(enc2) +
                Base64._keyStr.charAt(enc3) + Base64._keyStr.charAt(enc4);

            }

            return output;
        },

        // public method for decoding
        decode : function (input) {
            var output = "";
            var chr1, chr2, chr3;
            var enc1, enc2, enc3, enc4;
            var i = 0;

            input = input.replace(/[^A-Za-z0-9\+\/\=]/g, "");

            while (i < input.length) {

                enc1 = Base64._keyStr.indexOf(input.charAt(i++));
                enc2 = Base64._keyStr.indexOf(input.charAt(i++));
                enc3 = Base64._keyStr.indexOf(input.charAt(i++));
                enc4 = Base64._keyStr.indexOf(input.charAt(i++));

                chr1 = (enc1 << 2) | (enc2 >> 4);
                chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
                chr3 = ((enc3 & 3) << 6) | enc4;

                output = output + String.fromCharCode(chr1);

                if (enc3 != 64) {
                    output = output + String.fromCharCode(chr2);
                }
                if (enc4 != 64) {
                    output = output + String.fromCharCode(chr3);
                }

            }

            output = Base64._utf8_decode(output);

            return output;

        },

        // private method for UTF-8 encoding
        _utf8_encode : function (string) {
            string = string.replace(/\r\n/g,"\n");
            var utftext = "";

            for (var n = 0; n < string.length; n++) {

                var c = string.charCodeAt(n);

                if (c < 128) {
                    utftext += String.fromCharCode(c);
                }
                else if((c > 127) && (c < 2048)) {
                    utftext += String.fromCharCode((c >> 6) | 192);
                    utftext += String.fromCharCode((c & 63) | 128);
                }
                else {
                    utftext += String.fromCharCode((c >> 12) | 224);
                    utftext += String.fromCharCode(((c >> 6) & 63) | 128);
                    utftext += String.fromCharCode((c & 63) | 128);
                }

            }

            return utftext;
        },

        // private method for UTF-8 decoding
        _utf8_decode : function (utftext) {
            var string = "";
            var i = 0;
            var c = 0, c1 = 0, c2 = 0;

            while ( i < utftext.length ) {

                c = utftext.charCodeAt(i);

                if (c < 128) {
                    string += String.fromCharCode(c);
                    i++;
                }
                else if((c > 191) && (c < 224)) {
                    c1 = utftext.charCodeAt(i+1);
                    string += String.fromCharCode(((c & 31) << 6) | (c1 & 63));
                    i += 2;
                }
                else {
                    c1 = utftext.charCodeAt(i+1);
                    c2 = utftext.charCodeAt(i+2);
                    string += String.fromCharCode(((c & 15) << 12) | ((c1 & 63) << 6) | (c2 & 63));
                    i += 3;
                }

            }
            return string;
        }
    }
    
    /**
    *
    *  MD5 (Message-Digest Algorithm)
    *  http://www.webtoolkit.info/
    *
    **/

    var MD5 = function (string) {

    	function RotateLeft(lValue, iShiftBits) {
    		return (lValue<<iShiftBits) | (lValue>>>(32-iShiftBits));
    	}

    	function AddUnsigned(lX,lY) {
    		var lX4,lY4,lX8,lY8,lResult;
    		lX8 = (lX & 0x80000000); lY8 = (lY & 0x80000000); lX4 = (lX & 0x40000000); lY4 = (lY & 0x40000000);
    		lResult = (lX & 0x3FFFFFFF)+(lY & 0x3FFFFFFF);
    		if (lX4 & lY4) {
    			return (lResult ^ 0x80000000 ^ lX8 ^ lY8);
    		}
    		if (lX4 | lY4) {
    			if (lResult & 0x40000000) {
    				return (lResult ^ 0xC0000000 ^ lX8 ^ lY8);
    			} else {
    				return (lResult ^ 0x40000000 ^ lX8 ^ lY8);
    			}
    		} else {
    			return (lResult ^ lX8 ^ lY8);
    		}
     	}

     	function F(x,y,z) { return (x & y) | ((~x) & z); }
     	function G(x,y,z) { return (x & z) | (y & (~z)); }
     	function H(x,y,z) { return (x ^ y ^ z); }
    	function I(x,y,z) { return (y ^ (x | (~z))); }

    	function FF(a,b,c,d,x,s,ac) {
    		a = AddUnsigned(a, AddUnsigned(AddUnsigned(F(b, c, d), x), ac));
    		return AddUnsigned(RotateLeft(a, s), b);
    	};

    	function GG(a,b,c,d,x,s,ac) {
    		a = AddUnsigned(a, AddUnsigned(AddUnsigned(G(b, c, d), x), ac));
    		return AddUnsigned(RotateLeft(a, s), b);
    	};

    	function HH(a,b,c,d,x,s,ac) {
    		a = AddUnsigned(a, AddUnsigned(AddUnsigned(H(b, c, d), x), ac));
    		return AddUnsigned(RotateLeft(a, s), b);
    	};

    	function II(a,b,c,d,x,s,ac) {
    		a = AddUnsigned(a, AddUnsigned(AddUnsigned(I(b, c, d), x), ac));
    		return AddUnsigned(RotateLeft(a, s), b);
    	};

    	function ConvertToWordArray(string) {
    		var lWordCount;
    		var lMessageLength = string.length;
    		var lNumberOfWords_temp1=lMessageLength + 8;
    		var lNumberOfWords_temp2=(lNumberOfWords_temp1-(lNumberOfWords_temp1 % 64))/64;
    		var lNumberOfWords = (lNumberOfWords_temp2+1)*16;
    		var lWordArray=Array(lNumberOfWords-1);
    		var lBytePosition = 0;
    		var lByteCount = 0;
    		while ( lByteCount < lMessageLength ) {
    			lWordCount = (lByteCount-(lByteCount % 4))/4;
    			lBytePosition = (lByteCount % 4)*8;
    			lWordArray[lWordCount] = (lWordArray[lWordCount] | (string.charCodeAt(lByteCount)<<lBytePosition));
    			lByteCount++;
    		}
    		lWordCount = (lByteCount-(lByteCount % 4))/4;
    		lBytePosition = (lByteCount % 4)*8;
    		lWordArray[lWordCount] = lWordArray[lWordCount] | (0x80<<lBytePosition);
    		lWordArray[lNumberOfWords-2] = lMessageLength<<3;
    		lWordArray[lNumberOfWords-1] = lMessageLength>>>29;
    		return lWordArray;
    	};

    	function WordToHex(lValue) {
    		var WordToHexValue="",WordToHexValue_temp="",lByte,lCount;
    		for (lCount = 0;lCount<=3;lCount++) {
    			lByte = (lValue>>>(lCount*8)) & 255;
    			WordToHexValue_temp = "0" + lByte.toString(16);
    			WordToHexValue = WordToHexValue + WordToHexValue_temp.substr(WordToHexValue_temp.length-2,2);
    		}
    		return WordToHexValue;
    	};

    	function Utf8Encode(string) {
    		string = string.replace(/\r\n/g,"\n");
    		var utftext = "";

    		for (var n = 0; n < string.length; n++) {

    			var c = string.charCodeAt(n);

    			if (c < 128) {
    				utftext += String.fromCharCode(c);
    			}
    			else if((c > 127) && (c < 2048)) {
    				utftext += String.fromCharCode((c >> 6) | 192);
    				utftext += String.fromCharCode((c & 63) | 128);
    			}
    			else {
    				utftext += String.fromCharCode((c >> 12) | 224);
    				utftext += String.fromCharCode(((c >> 6) & 63) | 128);
    				utftext += String.fromCharCode((c & 63) | 128);
    			}

    		}

    		return utftext;
    	};

    	var x=Array();
    	var k,AA,BB,CC,DD,a,b,c,d;
    	var S11=7, S12=12, S13=17, S14=22;
    	var S21=5, S22=9 , S23=14, S24=20;
    	var S31=4, S32=11, S33=16, S34=23;
    	var S41=6, S42=10, S43=15, S44=21;

    	string = Utf8Encode(string);

    	x = ConvertToWordArray(string);

    	a = 0x67452301; b = 0xEFCDAB89; c = 0x98BADCFE; d = 0x10325476;

    	for (k=0;k<x.length;k+=16) {
    		AA=a; BB=b; CC=c; DD=d;
    		a=FF(a,b,c,d,x[k+0], S11,0xD76AA478);
    		d=FF(d,a,b,c,x[k+1], S12,0xE8C7B756);
    		c=FF(c,d,a,b,x[k+2], S13,0x242070DB);
    		b=FF(b,c,d,a,x[k+3], S14,0xC1BDCEEE);
    		a=FF(a,b,c,d,x[k+4], S11,0xF57C0FAF);
    		d=FF(d,a,b,c,x[k+5], S12,0x4787C62A);
    		c=FF(c,d,a,b,x[k+6], S13,0xA8304613);
    		b=FF(b,c,d,a,x[k+7], S14,0xFD469501);
    		a=FF(a,b,c,d,x[k+8], S11,0x698098D8);
    		d=FF(d,a,b,c,x[k+9], S12,0x8B44F7AF);
    		c=FF(c,d,a,b,x[k+10],S13,0xFFFF5BB1);
    		b=FF(b,c,d,a,x[k+11],S14,0x895CD7BE);
    		a=FF(a,b,c,d,x[k+12],S11,0x6B901122);
    		d=FF(d,a,b,c,x[k+13],S12,0xFD987193);
    		c=FF(c,d,a,b,x[k+14],S13,0xA679438E);
    		b=FF(b,c,d,a,x[k+15],S14,0x49B40821);
    		a=GG(a,b,c,d,x[k+1], S21,0xF61E2562);
    		d=GG(d,a,b,c,x[k+6], S22,0xC040B340);
    		c=GG(c,d,a,b,x[k+11],S23,0x265E5A51);
    		b=GG(b,c,d,a,x[k+0], S24,0xE9B6C7AA);
    		a=GG(a,b,c,d,x[k+5], S21,0xD62F105D);
    		d=GG(d,a,b,c,x[k+10],S22,0x2441453);
    		c=GG(c,d,a,b,x[k+15],S23,0xD8A1E681);
    		b=GG(b,c,d,a,x[k+4], S24,0xE7D3FBC8);
    		a=GG(a,b,c,d,x[k+9], S21,0x21E1CDE6);
    		d=GG(d,a,b,c,x[k+14],S22,0xC33707D6);
    		c=GG(c,d,a,b,x[k+3], S23,0xF4D50D87);
    		b=GG(b,c,d,a,x[k+8], S24,0x455A14ED);
    		a=GG(a,b,c,d,x[k+13],S21,0xA9E3E905);
    		d=GG(d,a,b,c,x[k+2], S22,0xFCEFA3F8);
    		c=GG(c,d,a,b,x[k+7], S23,0x676F02D9);
    		b=GG(b,c,d,a,x[k+12],S24,0x8D2A4C8A);
    		a=HH(a,b,c,d,x[k+5], S31,0xFFFA3942);
    		d=HH(d,a,b,c,x[k+8], S32,0x8771F681);
    		c=HH(c,d,a,b,x[k+11],S33,0x6D9D6122);
    		b=HH(b,c,d,a,x[k+14],S34,0xFDE5380C);
    		a=HH(a,b,c,d,x[k+1], S31,0xA4BEEA44);
    		d=HH(d,a,b,c,x[k+4], S32,0x4BDECFA9);
    		c=HH(c,d,a,b,x[k+7], S33,0xF6BB4B60);
    		b=HH(b,c,d,a,x[k+10],S34,0xBEBFBC70);
    		a=HH(a,b,c,d,x[k+13],S31,0x289B7EC6);
    		d=HH(d,a,b,c,x[k+0], S32,0xEAA127FA);
    		c=HH(c,d,a,b,x[k+3], S33,0xD4EF3085);
    		b=HH(b,c,d,a,x[k+6], S34,0x4881D05);
    		a=HH(a,b,c,d,x[k+9], S31,0xD9D4D039);
    		d=HH(d,a,b,c,x[k+12],S32,0xE6DB99E5);
    		c=HH(c,d,a,b,x[k+15],S33,0x1FA27CF8);
    		b=HH(b,c,d,a,x[k+2], S34,0xC4AC5665);
    		a=II(a,b,c,d,x[k+0], S41,0xF4292244);
    		d=II(d,a,b,c,x[k+7], S42,0x432AFF97);
    		c=II(c,d,a,b,x[k+14],S43,0xAB9423A7);
    		b=II(b,c,d,a,x[k+5], S44,0xFC93A039);
    		a=II(a,b,c,d,x[k+12],S41,0x655B59C3);
    		d=II(d,a,b,c,x[k+3], S42,0x8F0CCC92);
    		c=II(c,d,a,b,x[k+10],S43,0xFFEFF47D);
    		b=II(b,c,d,a,x[k+1], S44,0x85845DD1);
    		a=II(a,b,c,d,x[k+8], S41,0x6FA87E4F);
    		d=II(d,a,b,c,x[k+15],S42,0xFE2CE6E0);
    		c=II(c,d,a,b,x[k+6], S43,0xA3014314);
    		b=II(b,c,d,a,x[k+13],S44,0x4E0811A1);
    		a=II(a,b,c,d,x[k+4], S41,0xF7537E82);
    		d=II(d,a,b,c,x[k+11],S42,0xBD3AF235);
    		c=II(c,d,a,b,x[k+2], S43,0x2AD7D2BB);
    		b=II(b,c,d,a,x[k+9], S44,0xEB86D391);
    		a=AddUnsigned(a,AA);
    		b=AddUnsigned(b,BB);
    		c=AddUnsigned(c,CC);
    		d=AddUnsigned(d,DD);
    	}

    	var temp = WordToHex(a)+WordToHex(b)+WordToHex(c)+WordToHex(d);

    	return temp.toLowerCase();
    }
    
    //cross browser way to get size of window, http://www.javascripter.net/faq/browserw.htm
    var getWindowSize = function(){
        if (document.body && document.body.offsetWidth) {
           winW = document.body.offsetWidth;
           winH = document.body.offsetHeight;
        }
        
        else if (document.compatMode=='CSS1Compat' &&
            document.documentElement &&
            document.documentElement.offsetWidth ) {
           winW = document.documentElement.offsetWidth;
           winH = document.documentElement.offsetHeight;
        }
        
        else if (window.innerWidth && window.innerHeight) {
           winW = window.innerWidth;
           winH = window.innerHeight;
        }
        
        return [winW, winH];
    }
    
    //INTENT: Poor man's simulcrum of the range method in python, although used so narrowly here,
    //that I doubt I need improve it.
    //NOTE: you can merely write (x) instead of (0, x) as a conviencnce, but ONLY if you dont use yield.
    //i.e. range(3) = [0,1,2] and range(3,5) = [3, 4], etc.
    //the 'yield' just runs a method that takes i, cool i guess.
    var range = function(start, stop, yield){
        //if they didn't give a stop and yield, assume it's actually range(0,x);
        if(stop == undefined){
            stop = start;
            start = 0;
        }
        
        //alternate code paths to eliminate extra test for yield each iter.
        if(yield)
            for(var buf = [], i = start; i < stop; i ++)
                buf.push(yield(i));
        else
            for(var buf = [], i = start; i < stop; i ++)
                buf.push(i);
        
        return buf;
    };
    
    /* simply sort for numbers, as opposed to the default alphabetical sort */
    var numericalSort = function(a, b){
        if(a < b) return -1;
        else if(a == b) return 0;
        else if(a > b) return 1;
    };
    
    //INTENT: return a copy of a list, of dictionaries, sorted by a given key and order.
    Array.prototype.sortByKey = function(key, extract, sortfunc){
        var key_value_and_object_pairs = [];
        for(var i = 0; i != this.length ; i ++)
            key_value_and_object_pairs.push([this[i][key], this[i]]);
            
        key_value_and_object_pairs = key_value_and_object_pairs.sort(sortfunc);
        
        var output = [];
        
        if(extract === undefined)
            for(var i = 0; i != key_value_and_object_pairs.length ; i ++)
                output.push(key_value_and_object_pairs[i][1]);
        else
            for(var i = 0; i != key_value_and_object_pairs.length ; i ++)
                output.push(key_value_and_object_pairs[i][1][extract]);
            
        return output;
    };
    
    //add any items in withwhat to the list
    if(!Array.prototype.extend){
        Array.prototype.extend = function(withwhat){
            for(var i = 0; i < withwhat.length ; i ++)
                this.push(withwhat[i]);
            return this;
        }
    }else{
        alert("Array.extend already defined!");
    }
    
    //will remove any items that appear in removefromlist and return the list.
    if(!Array.prototype.omit){
        Array.prototype.omit = function(removefromlist){
            
            if(!(removefromlist instanceof Array))
                removefromlist = [removefromlist];
            
            for(var i = this.length-1; i != -1 ; i --)
                if(removefromlist.indexOf(this[i]) !== -1)
                    this.remove(i);
                
            return this;
        }
    }else{
        alert("Array.omit already defined!")
    }
    
    /* will, if every entry is a string, return each string that ends with the 1st arg */
    if(!Array.prototype.endswith){
        Array.prototype.endswith = function(what){
            if(!what)
                return this;
                
            var filtered = [];
            for(var i = 0; i < this.length ; i ++)
                if(gettype(this[i]) == 'string' && this[i].endswith(what))
                    filtered.push(this[i]);
                    
            return filtered;
        }
    }else{
        alert("Array.endswith already defined!")
    }
    
    /* will, if every entry is a string, return each string that starts with the 1st arg */
    if(!Array.prototype.startswith){
        Array.prototype.startswith = function(what){
            var filtered = [];
            for(var i = 0; i < this.length ; i ++)
                if(gettype(this[i]) == 'string' && this[i].startswith(what))
                    filtered.push(this[i]);
                    
            return filtered;
        }
    }else{
        alert("Array.startswith already defined!")
    }
    
    // This is a way to schedule the contents of the list for proessing item by 
    // item utilizing setTimeout to spread the work out. I hope the args are clear;
       
    // operation(items, i) is the function that runs each item. return value undefined
    // leaves item unchanged, returning anything else sets it
       
    // progress(items, i) is the function that runs each item, to for example update UI
    // to reflect status. returning false will cause the "thread" to stop.
       
    // complete(items, i) is the function that runs once at the end, to signify
    // completion of the thread. return value is discarded.
    
    // Example:
    
        // [1, 2, 3, 4, 5, 6, 7, 8].thread(function(item, i){
        //     return item*i;
        // }, function(items, i){
        //     console.log("processing item", i, "is", items[i])
        // }, function(items, i){
        //     console.log("finished processing "+i+" items:", items);
        // }, 600);
    
    Array.prototype.thread = function(operation, progress, complete, interval){
        //these variables are referenced by operation_method via closure.
        var items = this;
        var interval = interval || 10;
        
        //this will run for each item in the list to operate on. It calls itself via setTimeout.
        var operation_method = function(idx){
            //perform the operation for this round, and assign result, if any, back to the item
            var result = operation(items[idx], idx);
            items[idx] = result === undefined ? items[idx] : result;
            ++ idx;
                        
            //if idx is equal to the string's length
            if(idx == items.length)
                return complete(items, idx);
                
            //if progress returns false, stop further processing
            if(progress && progress(items, idx) === false)
                return;
                
            //scheule next loop. IDX is explicitly passed, as
            setTimeout(operation_method, interval, idx);
        }
        
        //the first setTimeout to start off the processing.
        setTimeout(operation_method, interval, 0);
        
        //return this to faciliate chaining.
        return this;
    }
    
    if(!String.prototype.removeEnding){
        String.prototype.removeEnding = function(what){
            if(this.endswith(what))
                return this.slice(0, -what.length)
            return this;
        }
    }else{
        alert("Array.endswith already defined!")
    }
    
    if(!String.prototype.count){
        String.prototype.count = function(substr){
            var num, pos;
            num = pos = 0;
            
            if(!this.length) 
                return 0;
                
            while(pos = 1 + this.indexOf(substr, pos))
                num ++;
                
            return num;
        };
    }else{
        alert("String.count already defined!")
    }
    
    if(!Array.prototype.sorted){
        Array.prototype.sorted = function(withFunction){
            this.sort(withFunction);
            return this;
        }
    }else{
        alert("Array.startswith already defined!")
    }
    
    /* INTENT: return an element as an object for per-attribute printing instead of xml, in console.log methods */
    var elemToDict = function(obj){
        var output = {}
        for(var key in obj)
            output[key] = obj[key];
        return output;
    }
    
    /* this simply sits in a while loop, blocking, until the # of msecs is up. for dev testing, etc. */
    function wait(msecs){
        var start = new Date().getTime();
        var cur = start
        while(cur - start < msecs)
            cur = new Date().getTime();
    }
    
    //INTENT: simple abstraction of animation as commonly used in nametag apps
    var Animation = function(target, anim, complete, queue){
        $(target).animate(anim, {queue:queue ? queue : false, duration:Nametag.GUI.duration, complete:complete});
    };
    
    /* THANKS stackoverflow ??? */
    function getViewOffset(node, singleFrame) {
        function addOffset(node, coords, view) {
            var p = node.offsetParent;
            coords.x += node.offsetLeft - (p ? p.scrollLeft : 0);
            coords.y += node.offsetTop - (p ? p.scrollTop : 0);
            
            if (p) {
                if (p.nodeType == 1) {
                    var parentStyle = view.getComputedStyle(p, '');
                    if (parentStyle.position != 'static') {
                        coords.x += parseInt(parentStyle.borderLeftWidth);
                        coords.y += parseInt(parentStyle.borderTopWidth);
                        
                        if (p.localName == 'TABLE') {
                          coords.x += parseInt(parentStyle.paddingLeft);
                          coords.y += parseInt(parentStyle.paddingTop);
                        }
                        else if (p.localName == 'BODY') {
                          var style = view.getComputedStyle(node, '');
                          coords.x += parseInt(style.marginLeft);
                          coords.y += parseInt(style.marginTop);
                        }
                    }
                    else if (p.localName == 'BODY') {
                        coords.x += parseInt(parentStyle.borderLeftWidth);
                        coords.y += parseInt(parentStyle.borderTopWidth);
                    }
                    
                    var parent = node.parentNode;
                    while (p != parent) {
                        coords.x -= parent.scrollLeft;
                        coords.y -= parent.scrollTop;
                        parent = parent.parentNode;
                    }
                    addOffset(p, coords, view);
                }
            }
            
            else {
                if (node.localName == 'BODY') {
                    var style = view.getComputedStyle(node, '');
                    coords.x += parseInt(style.borderLeftWidth);
                    coords.y += parseInt(style.borderTopWidth);
                    
                    var htmlStyle = view.getComputedStyle(node.parentNode, '');
                    coords.x -= parseInt(htmlStyle.paddingLeft);
                    coords.y -= parseInt(htmlStyle.paddingTop);
                }
                
                if (node.scrollLeft)
                    coords.x += node.scrollLeft;
                if (node.scrollTop)
                    coords.y += node.scrollTop;
                
                var win = node.ownerDocument.defaultView;
                if (win && (!singleFrame && win.frameElement))
                    addOffset(win.frameElement, coords, win);
            }
        }
        
        var coords = { x: 0, y: 0 };
        if(node)
            addOffset(node, coords, node.ownerDocument.defaultView);
        
        return coords;
    }
    
    /* this is for variable replacment in HTML that doesn't like %... */
    function mod(a, b){
        return a % b;
    }
    
    /* thanks stackoverflow: http://stackoverflow.com/questions/811195/fast-open-source-checksum-for-small-strings */
    function checksum(s){
      var i;
      var chk = 0x12345678;

      for(i = 0; i < s.length; i++)
          chk += (s.charCodeAt(i) * i);

      return chk;
    }
    
    /* this takes a dict and returns a list of (sorted) key-value pairs. */
    function dictToList(d){
        var output = [];
        
        for(var key in d)
            output.push([key, {key:key, value:d[key]}]);
        output.sort();
        
        var final_output = [];
        for(var i = 0; i < output.length ; i ++)
            final_output.push(output[i][1]);
            
        return final_output;
    }
    
    /* there are global objects that would like to notify people they are available, and the nametag initstages
       are important for their ordering alone. this will let some normal object send a known ordering of 
       events allowing listeners (the programmers) to respect casuality across differently enacted algorithms   */
    function SendInitstages(target, dontSendInitFlag){
        if(dontSendInitFlag === undefined)
            set(target, "__init__", true);
        set(target, "__load__", true);
        set(target, "__loaded__", true);
        set(target, "__ready__", true);
        set(target, "__after__", true);
        set(target, "__finally__", true);
    };
    
    //cross platform abstraction
    var stopEvent = function(e) {
        stopPropagation(e);
        preventDefault(e);
        return false;
    };
    
    //cross platform abstraction
    var stopPropagation = function(e) {
        if (e.stopPropagation)
            e.stopPropagation();
        else
            e.cancelBubble = true;
    };

    //cross platform abstraction
    var preventDefault = function(e) {
        if (e.preventDefault)
            e.preventDefault();
        else
            e.returnValue = false;
    };
    
    /* I know that using jquery to bind to scroll wheel AND the second 
       raw method here seem redundant, but the final effect is that 
       with both, the contents update while scrolling while just with 
       .scroll(), it only refreshes on mouseup */
    var onscroll = function(element, fun){
        $(element).scroll(fun);
        
        if(element.addEventListener){
            element.addEventListener('DOMMouseScroll', fun, false);
            element.addEventListener('mousewheel', fun, false); /* Chrome */
        }
        else
            element.onmousewheel = fun;
    };
    
    /* thank http://www.htmlgoodies.com/html5/javascript/drag-files-into-the-browser-from-the-desktop-HTML5.html#fbid=EyQyq-bbvmU */
    var addEventHandler = function(obj, evt, handler, order) {
        if(obj.addEventListener) {
            // W3C method
            obj.addEventListener(evt, handler, order || false);
        } else if(obj.attachEvent) {
            // IE method.
            obj.attachEvent('on'+evt, handler);
        } else {
            // Old school method.
            obj['on'+evt] = handler;
        }
    };
    
    /* thanks stackoverflow: http://stackoverflow.com/questions/3407012/c-rounding-up-to-the-nearest-multiple-of-a-number */
    var round_up = function(num, factor){
        return (num + factor - 1 - (num - 1) % factor) - factor; 
    };
    
    var openAnimation = function(item, after, duration){
        if(!duration)
            duration = 300;
            
        var jitem = $(item);
        
        //jitem.scale(2.5).css('opacity', 0).rotate('8deg');
        
        jitem.animate({
            scale:1.5, opacity:0.3, rotate:"8deg"
        }, {duration:(duration/3)*2, queue:true});
        
        jitem.animate({
            scale:1, opacity:1, rotate:"0deg"
        }, {duration:duration/3-10, queue:true});
        
        setTimeout(function(){
            after();
        }, duration+10);   
    }
    
    /* parse a query string, minus the leading '?', that also decodes each entry, to return a dict of key/values
       string as a friendly dict (leave out first '?' if using manually)*/
    function parseQueryString(query_string_text){
        var urlParams = {};
        var add_char_rgx = /\+/g; // Regex for replacing addition symbol with a space
        var param_split_rgx = /([^&=]+)=?([^&]*)/g;
    
        var decodeParam = function(buf){
            return decodeURIComponent(
                buf.replace(add_char_rgx, " ")
            ); 
        };
    
        var results;
        while(results = param_split_rgx.exec(query_string_text))
            urlParams[decodeParam(results[1])] = decodeParam(results[2]);
    
        return urlParams;
    }
    
    /* INTENT:extract the server from any given url */
    var getServerFromURL = function(url) {
       return url.match(/:\/\/(.[^/]+)/)[1];
    };
    
    /* convienence: given three parts a, b, and c, return a path such that you get /a/b.c  for makepath('/a', 'b', 'c'), or with the extension disabled if not given */
    function makepath(folder, file, extension){
        return extension ? 
            folder+"/"+file : 
            folder+"/"+file+"."+extension;
    }
    
    /* we often wish to use angle brackets in javascript that's also inside a tag. these constants helps with that. */
    var lt = String.fromCharCode(60), gt = String.fromCharCode(62);
    
    //simple method to test if dict is empty efficiently.
    function haskeys(obj){
        for(var i in obj)
            return true;
        return false;
    };
    
    function urlEncode(url) {
        return encodeURIComponent(url)
            .replace(/!/g, '%21')
            .replace(/'/g, '%27')
            .replace(/\(/g, '%28')
            .replace(/\)/g, '%29')
            .replace(/\*/g, '%2A');
    };
    
    //basic func i brought in to deal with S3 - still using jquery cept for that, but hey
    function getXmlHttpObject(){
        var xmlHttp = null;

        try {
            // Firefox, Opera 8.0+, Safari, IE 7+
            xmlHttp = new XMLHttpRequest();
        } 

        catch (e) {
            // Internet Explorer - old IE - prior to version 7
            try {
                xmlHttp = new ActiveXObject("Msxml2.XMLHTTP");
            } 

            catch (e) {
                xmlHttp = new ActiveXObject("Microsoft.XMLHTTP");
            }
        }

        return xmlHttp;
    }
    
    //Extracted GUI/Focus system extracted from TagOS, for the runtime
        
    var isAltPressed = false;
    var isCrtlPressed = false;
    var isMetaPressed = false;
    var isShiftPressed = false;
    
    Nametag.GUI = function(){
        var self = {};
        self.Desktops = []; 
        self.Desktop = false;
        self.disableKeyEvents = false; 
        self._SizedToWindowInitialEventsRequired = [];
        self.mousemove = false;
        self.duration = 300;
        self._AppMenubarHeight = 19;
        self.cancelDragIfOccuring = function(){
            var state = Nametag.Dragging.state;
            var dragmethods = NametagDraggingClass.prototype;
            if(state == 'waiting'){
                Nametag.Dragging.state = 'idle';
                return false;
            }
            else if(state == "dragging"){
                dragmethods.dragDropping(false, false);
                return false;
            }
            return true;
        };
        self.focus = {
            setLayer:function(layer){
                if(this.layer == layer)
                    return;
                if(!layer.window)
                    layer.window = {};
                if(!layer._windowStack)
                    layer._windowStack = [];
                if(this.layer && this.layer.window){
                    send(this.layer.window, '__unfocused__');
                    if(this.layer.window.focused && this.layer.window.focused.focusring !== false)  
                        $(this.layer.window.focused).removeClass("focused");
                }
                set(this, 'layer', layer);
                if(this.layer.window)
                    send(this.layer.window, '__focused__');
                var focused = this.layer.window.focused;
                if(focused){
                    if(focused.tagName.toLowerCase() == 'input')
                        $(focused).focus();
                    if(focused.focusring !== false)  
                        $(focused).addClass("focused");
                }
            },
            setWindow:function(element){
                if(this.layer.window.focused)
                    if(this.layer.window.focused.focusring !== false)
                        $(this.layer.window.focused).removeClass("focused").blur();
                if(this.layer.window)
                    send(this.layer.window, '__unfocused__');
                set(this.layer, 'window', element);
                if(element)
                    send(this.layer.window, '__focused__');
                var focused = this.layer.window.focused;
                if(focused){
                    if(focused.tagName.toLowerCase() == 'input')
                        $(focused).focus();
                    if(focused.focusring !== false)  
                        $(focused).addClass("focused");
                }
            },
            setFocused:function(element){
                if(!this.layer  || !this.layer.window || (this.layer.window.focused && this.layer.window.focused === element))
                    return;
                var focused = this.layer.window.focused;
                if(focused && focused != element){
                    var jtarget = $(focused);
                    if(focused.focusring !== false)
                        jtarget.removeClass("focused");
                }
                set(this.layer.window, 'focused', element);
                if(element && element.focusring !== false)
                    $(element).addClass("focused");
            },
            pushFocused:function(element){
                var layer = Nametag.GUI.focus.layer;
                var lastFocus = false;
                if(layer && layer.window && layer.window.focused)
                    lastFocus = layer.window.focused;
                if(Nametag.GUI.focus.layer && Nametag.GUI.focus.layer.window != element){
                    Nametag.GUI.focus.setFocused(element); 
                    Nametag.GUI.focus._lastFocus = lastFocus;
                }
            },
            popFocused:function(){
                var layer = Nametag.GUI.focus.layer;
                if(Nametag.GUI.focus._lastFocus)
                    Nametag.GUI.focus.setFocused(Nametag.GUI.focus._lastFocus);
                else if(layer && layer.window)
                    layer.window.focused = false;
                Nametag.GUI.focus._lastFocus = false;
            },
            blurInputMethod:function(e){
                Nametag.GUI.focus.setFocused(false);
            },
            focusInputMethod:function(e){
                Nametag.GUI.focus.setFocused(this);
            }
        };
        return self;
    }();
    
    listen(Nametag, '__ready__', function(){
        $(window).mousemove(function(e){
            Nametag.GUI.mousemove = e;
            return true;
        }); 
        $(window).mouseup(function(e){
            Nametag.GUI.mousedown = false;
            Nametag.GUI.cancelDragIfOccuring();
            return true;
        });
        $(window).keyup(function(e){ 
            isAltPressed = e.altKey;    
            isCrtlPressed= e.crtlKey;
            isMetaPressed = e.metaKey;
            isShiftPressed = e.shiftKey !== undefined ? e.shiftKey : isShiftPressed;
            return true;
        });
        $(window).focus(function(e){ 
            isAltPressed = false;
            return true;
        });
        $(window).blur(function(e){ 
            isAltPressed = false;
            return true;
        });
        $(window).keydown(function(e){
            try{
                var retval;
                isAltPressed = e.altKey;
                isCrtlPressed = e.crtlKey;
                isMetaPressed = e.metaKey;
                isShiftPressed = e.shiftKey !== undefined ? e.shiftKey : isShiftPressed;
                if(e.metaKey)
                    return true;
                var self = Nametag.GUI.focus.layer ? 
                    Nametag.GUI.focus.layer.window : false;
                if(self && e.keyCode == 8 && self.focused && self.focused.tagName.toLowerCase() == 'input')
                    return true;
                if(self)
                    var jself = $(self);
                if(Nametag.GUI.showKeyCode)
                    Nametag.Debugger.comment("e.keyCode", e.keyCode);
                else if(!self)
                    return true;
                if(e.keyCode == 13)
                    retval = conditionalFocusFireForApp(self, e, '__enter__');
                else if(e.keyCode == 32)
                    retval = conditionalFocusFireForApp(self, e, '__space__');
                else if(e.keyCode == 8){
                    retval = conditionalFocusFireForApp(self, e, '__backspace__');
                    if(self.focused && self.focused['__backspace__'])
                        return false;
                }
                else if(e.keyCode == 38)
                    retval = conditionalFocusFireForApp(self, e, '__uparrow__');
                else if(e.keyCode == 40)
                    retval = conditionalFocusFireForApp(self, e, '__downarrow__');
                else if(e.keyCode == 37)
                    retval = conditionalFocusFireForApp(self, e, '__leftarrow__');
                else if(e.keyCode == 39)
                    retval = conditionalFocusFireForApp(self, e, '__rightarrow__'); 
                else if(e.keyCode == 27)
                    retval = conditionalFocusFireForApp(self, e, '__escape__');  
                else if(e.keyCode == 9)
                    retval = conditionalFocusFireForApp(self, e, '__tab__');           
                if(retval !== false && e.altKey) /* !self.fullscreen &&  */{
                    retval = conditionalSend(self, 'shortcutKey', function(method, context){
                        return method.call(context ? context : self, e.keyCode, String.fromCharCode(e.keyCode), e);
                    });
                }
                if(retval !== false){
                    conditionalSend(self, '__keypress__', function(method, context){
                        var val = method.call(context, e);
                        if(retval !== false)
                            retval = val;
                        return true; /* perform all handlers regardless of retval */
                    });
                    if(self.focused && self.focused.__keypress__){
                        retval = self.focused.__keypress__(e) || false;
                        self.focused.send('__keypress__', e);
                    }
                }
                if(isAltPressed && (e.keyCode == 38 || e.keyCode == 40 || e.keyCode == 82) )  /*  && e.keyCode < 37 && e.keyCode > 40 */
                    return false;
                if(e.keyCode == 8 && (!self.focused || self.focused.tagName.toLowerCase() != 'input'))
                    return false;
                return retval === undefined ? true : retval;
            }
            catch(e){
                var msg = "Error handling a keydown event. Key was "+e.keyCode+", Target is: "+String(e.target)+"\n\nError is: "+e;
                Nametag.Debugger.error(msg);
                return false;
            }  
        });
    });
    
    function conditionalFocusFireForApp(self, e, eventname){
        var retval;
        conditionalSend(self, eventname, function(method, context){
            var val = method.call(context, e);
            if(retval !== false && retval !== undefined)
                retval = val;
            return true; /* perform all handlers regardless of retval */
        });
        if(retval !== false && self.api && self.api[eventname]){
            retval = self.api[eventname](e) || false;
            conditionalSend(self.api, eventname, function(method, context){
                var val = method.call(context, e);
                if(retval !== false)
                    retval = val;
                return true; /* perform all handlers regardless of retval */
            });
        }
        if(retval !== false && self.focused && self.focused[eventname]){
            retval = self.focused[eventname](e) || false;
            conditionalSend(self.focused, eventname, function(method, context){
                var val = method.call(context, e);
                if(retval !== false)
                    retval = val;
                return true; /* perform all handlers regardless of retval */
            });    
        }
        return retval;
    };
    
    function SendToBack(element, onlyIfHasClassFlag){
        return BringToFront(element, onlyIfHasClassFlag, true);
    };
    
    function BringToFront(element, onlyIfHasClassFlag, reverseFlag){
        onlyIfHasClassFlag = onlyIfHasClassFlag ? '.'+onlyIfHasClassFlag : undefined;
        var children = $.makeArray($(element).parent().children(onlyIfHasClassFlag));
        var zmap = [];
        for(var i = 0; i < children.length ; i ++)
            zmap[children[i]._zindex] = children[i];
        var offset = 0;
        var reordered_zmap = [];
        for(var k = 0; k < zmap.length ; k ++)
            if(zmap[k] && zmap[k] != element)
                reordered_zmap.push(zmap[k]);                    
        for(var i = reverseFlag ? 1 : 0; i < reordered_zmap.length ; i ++){
            reordered_zmap[i]._zindex = i;
            $(reordered_zmap[i]).css("z-index", i);
        }    
        element._zindex = reverseFlag ? 0 : reordered_zmap.length;;
        $(element).css("z-index", element._zindex);
    }
    
    /* COMPILER for NAMETAG FRAMEWORK, c. 2012 JAMES ROBEY - all rights reserved. */

    var CompilerClass = function(){
        var self = this;

        /* at the moment this only controls if the path of a compiled nametag is included with itself, 
           for debugging purposes in the runtime portion. The runtime portion will use it if it's there
           (setting Nametag.Runtime.debug to t/f will use/not use this to put the path of a nametag
            on the nametag via the debug_script_path attr that shows up in web console debuggers.) */
        self.debug = true;

        /* a place to keep a reverse uuid to name lookup for better debug messages */
        self.uuid_to_name_debug_lookup = {};

        return self;
    };

    /* =======================================================================================

       CONCEPT DIVISION: THE MATERIAL ABOVE WAS WRITTEN TO PROCESS NAMETAGS FROM NODE TO 
       IN-MEMORY DEFINITION. THE MATERIAL BELOW IS MEANT TO WORK WITH THE FILE SYSTEM
       WHEN COMPILING AND IS CAPABLE OF PACKAGING APPS (SOMETHING THE ABOVE DOESN'T DO ITSELF) 

       ======================================================================================= */

    //INTENT: given a script name, search various sources and, using the text from that source,
    //create an actual script storeed in various buckets to be used when a script of that type is made.
    //this is run when the script is not already loaded.
    CompilerClass.prototype.ImportIntoTemplateCache = function(script_name){
        var self = this;

        //INTENT: determine full name to use. if no server given, store under "*/"+script_name - the default server
        if(script_name.indexOf("/") == -1)
            script_name = "*/"+script_name;

        //INTENT: try to get the script node from one of the imported scripts
        if(Nametag.Runtime.TemplateNodesByServer[script_name])
            var scriptnode = Nametag.Runtime.TemplateNodesByServer[script_name];

        //is the script local?
        else if(script_name.indexOf("*/") == 0){
            var scriptnode = $('#'+script_name.slice(2))[0];
        }

        //Finally, if neither worked, the script was not found.
        if(!scriptnode){
            var msg = "A script by the name of "+script_name+" was invoked, but no local or imported script by that name exists.";
            /* Nametag.Debugger.error(msg); */
            throw msg;
        }

        //move attribute/value pairs from the script node to the codeblock, where possible, 
        //making it possible to assign variables or the special 'classes' attribute from the script tag.
        //it wraps the content in quotes normally, but it will recognize %{x} as meaning to print the 
        //value without quotes, which in the codeblock syntax makes it eval'd like we want.
        //(this is of no use in the file-based compiler, but is of use when writing raw script tags.)
        scriptnode = self._parseAttributesIntoCodeBlock(scriptnode);

        //change any "$" in a style tag to the name of the script to automate local css names.
        var css_name = script_name.slice(script_name.indexOf("/")+1);

        //the text to use from the script has certain conventions we enable to get around the limits of HTML.
        var scriptnode_text = PrintXML(scriptnode)
            .replace(/\&lt\;/g, "<") //these two lines MUST be here for FF - FF 'encodes' script tag text when it prints them.
            .replace(/\&gt\;/g, ">") //"""
            .replace(/\[\=/g, "{{= ")
            .replace(/\=\]/g, "}}")
            .replace(/\\\/\\\//g, "//")
            .replace(/\&quot\;/g, "\"")
            .replace(/\&(?!\w|\#)/g, '&amp;');

        //get the full xml of the script tag to use in assembling a jquery script!
        //we GOTTA declare the namespace or firefox hates on us!
        var script_dom = ParseXML("<div xmlns='http://www.w3.org/1999/xhtml'></div>");
        var script_nodes = ParseXML(scriptnode_text);
        for(var i = 0; i < script_nodes.childNodes.length ; i ++)
            script_dom.appendChild(script_nodes.childNodes[i].cloneNode(true)); //must clone, why i do not know.

        //INTENT: handle __ready__, __init__, etc. code at top of named-scripts!
        //looking at the children of the dom'd script, pull out any
        //text saving it in codeblock, (taking all dom elements and saving them for scripts, later)
        var codeblock = "";
        var nodesToRemove = [];

        for(var i = 0, node; (node = script_dom.childNodes[i]); i ++){
            if(node.nodeType == 3){
                codeblock += node.nodeValue;
                nodesToRemove.push(node);
            }

            /* this gets rid of comments - they can mess up having a single node for lists.. */
            else if(node.nodeType == 8)
                nodesToRemove.push(node);
        }

        /* by removing nodes AFTER we accumulate text
           we can delete both text and comment nodes without upsetting the 
           loop above. */
        var node;
        while((node = nodesToRemove.shift()))
            script_dom.removeChild(node);

        //for each key in the resulting dict (evaling the text at the top level), 
        //find each given name, in turn, in the global scope. Use the script name
        //as the key on global dict - and the value here as the value there.
        //in this way we build __init__.Templatename = func() structures,
        //like we want.
        if(codeblock){
            codeblock = codeblock
                .replace(/\%lt\;/g, "<")
                .replace(/\%gt\;/g, ">")
                .replace(/\{\-/g, "<")
                .replace(/\-\}/g, ">")
                .replace(/\&quot\;/g, "\"");

            //Turn codeblock into a dict (i.e. "x" -> "{x}", with any trailing comma of x removed)
            codeblock = codeblock.trim();
            if(codeblock.slice(-1) == ",")
                codeblock = codeblock.slice(0, codeblock.length-1);
            codeblock = "{" + codeblock + "}";

            //if jslint is available this will check the code for errors.
            if(Nametag.Runtime.debug){
                var result = checkDictionaryForErrors(codeblock);
                if(result)
                    throw "SYNTAX ERROR: " + String(result) + '\n\nCode is:\n\n' + Nametag.Runtime.addLineNumbers(codeblock);
            }

            //copy all methods over to a storage area for use when making instances
            Nametag.Runtime.CompiledTemplateOptionsTextCache[script_name] = codeblock;

            try{
                eval("var codeblock_method = function(self){return "+codeblock+";};");
            }catch(e){
                var msg = "NametagOS Compiler\n    An error occurred compiling "+self.uuid_to_name_debug_lookup[script_name.slice(2)] || script_name+":\n\n    "+String(e);
                /* Nametag.Debugger.error(msg); */
                throw msg;
            }

            Nametag.Runtime.CompiledTemplateOptionsCache[script_name] = codeblock_method;
        }

        /* if there is no codeblock provide a default!  */
        else{
            //copy all methods over to a storage area for use when making instances
            codeblock = "false";
            Nametag.Runtime.CompiledTemplateOptionsTextCache[script_name] = codeblock;

            try{
                eval("var codeblock_method = function(self){return "+codeblock+";};");
            }catch(e){
                throw "NametagOS Compiler\n    An error occurred compiling "+self.uuid_to_name_debug_lookup[script_name.slice(2)] || script_name+":\n\n    "+String(e);
            }

            Nametag.Runtime.CompiledTemplateOptionsCache[script_name] = codeblock_method;   
        }

        //for each script we will cache, process it for tags meant to be 
        //replaced (class tags) i.e <foo> becomes <div class="nametag" script="foo"/>
        //which when combined with the text the user types, will form the finished tag.
        self._ConvertNametagsToInstances(script_dom);

        //INTENT: for each anonymous script found, turn it into a "Real" script and substitute.
        //This is recursive - any further anonymous script found will again be realified
        self._RecursivelySubstituteRealTemplatesForAnonymousOnes(script_name, script_dom);

        //Back to text instead of DOM...
        //self._decodeURIsInNodeAttributes: FF wants to be "helpful" (give me a break!) and escape anything in src or href attrs.. even when
        //using DOMParser! This means that {{= x}} would be escaped to %7D%7D=%20x%7B%7B and so would not be recognized by
        //the jquery scripts var replacement! what a crock. This sets it back to right -- via string replacement, efficiently -- and ONLY on those attrs
        //that need it (i.e. src, href)
        scriptnode_text = self._decodeURIsInNodeAttributes(['src', 'href'], PrintInnerXML(script_dom));

        try{
            scriptnode_text = scriptnode_text
                .replace(/\%lt\;/g, "&lt;")
                .replace(/\%gt\;/g, "&gt;")
                .replace(/\{\-/g, "&lt;")
                .replace(/\-\}/g, "&gt;")
                .replace(/\&quot\;/g, "\"");

            var template = $.template(scriptnode_text);
            Nametag.Runtime.CompiledTemplateCache[script_name] = template;
        }catch(err){
            throw "problem compiling the script "+script_name+", "+err+".\n\n"+scriptnode_text;
        }

        scriptnode = null;
        scriptnode_text = null;
        script_dom = null;
    };

    //INTENT: Look at a script dom as written in a scriptag
    //and, for each inner_script identified, turn it into
    //a "real" script, substituting the anonymous contents
    //for that synthesized, unique "real" script name made.
    //If this is done recursively, then any script will 
    //spawn N "anonymous" (but real) scripts that will combine
    //to create the final struture as envisioned.
    CompilerClass.prototype._RecursivelySubstituteRealTemplatesForAnonymousOnes = function(script_name, script_dom){
        //get the server, if any, from the script
        var server = script_dom.getAttribute("server") || "*";

        /* SO important for compiling - keep a list of all anonymous templates spawned from
           rhia one, for packaging, later. */
        if(Nametag.Runtime.AnonymousTemplatesForTemplate[script_name] === undefined)
            Nametag.Runtime.AnonymousTemplatesForTemplate[script_name] = {};

        //our standard setup for a non-recursive traversal of the DOM:
        var all_items = $.makeArray(script_dom.childNodes);
        var item;
        while(item = all_items.shift()){
            //if not a tag, (comment, text, etc) skip.
            if(item.nodeType != 1)
                continue;

            //if a nametag, take contents and make a script using import!
            else if(hasClass(item, "nametag")){

                //Figure out what inner_script_nodes if any exist on this nametag
                var inner_script_nodes = [];
                var children = $.makeArray(item.childNodes);
                for(var i = 0; i < children.length ; i ++)
                    if(children[i].nodeType == 1){
                        //save the node to be processed below
                        inner_script_nodes.push(children[i].cloneNode(true));
                        //remove the tag from the script - it will be referred to by uuid from here on.
                        item.removeChild(children[i]);
                    }          

                //if there were inner_script_nodes, make it script; register it with a uuid put back on the nametag. done!
                if(inner_script_nodes.length){
                    //suck up anonyous script nodes -- any (nodeType == 1) in the item
                    var inner_script = EmptyScript.cloneNode(true);

                    //for each anonymous script node discovered above, insert it into the div, above, the container of our script-to-make.
                    for(var i = 0; i < inner_script_nodes.length ; i ++)
                        inner_script.appendChild(inner_script_nodes[i]);

                    //set the id by which the script will be stored. But.. A TWIST!
                    //if we derive the script name based on MD5 (quick) of domain+anonscript text,
                    //any /exactly/ the same script will share but one script, no matter where it be written.
                    //yes, extra cycles to gen an md5 and collisions will be rare, but i like it.
                    var uuid = MD5(PrintXML(inner_script));
                    var server_and_script_name = server+"/"+uuid;

                    //pass the newly made anon script to the TemplateCache to add ('cause it won't add twice, so md5 id is not duped!)
                    Nametag.Runtime.TemplateNodesByServer[server_and_script_name] = inner_script;
                    Nametag.Runtime.TemplateLowercaseLookup[server_and_script_name.toLowerCase()] = server_and_script_name;

                    //record that an anonymous template is the result of compiling the main template passed in
                    Nametag.Runtime.AnonymousTemplatesForTemplate[script_name][server_and_script_name] = true;

                    //Finally, importantly (isn't it all) add the option that will associate the nametag instance with it's anonymous script, as made above.
                    $(item).attr("inner_script", uuid);
                }
            }

            //if not a nametag, merely add it's children, if any, to be further considered.
            else{
                var children = $.makeArray(item.childNodes);
                if(children.length)
                    for(var i = 0; i < children.length ; i ++)
                        if(children[i].nodeType == 1)
                            all_items.push(children[i]);
            }
        }

        return script_dom;
    };

    /*INTENT: store compiled scripts AND make top-level text-defined method name and bodies
      as the evaluated-value stored on some global tracking object (like __ready__ defined here 
      will become an entry for the script's ready, i.e. __ready__.somescript)

      The script compiler will erase those text nodes it finds with init methods at the top 
      of the script, and write the string resulting from those deletions to be the actual script
      so the programmer can give us input text (in the dom) that's not in the output text (in the dom)=
      required for allowing a very nice init mechanism like this:

      <script id="somename" type="text/nametag>"
           __ready__:function(){
               ... 
           },

           __defaults__:{key:val, key:val}

      ...to be the methods that run when this script is loaded
      and the default given for this script.

      i don't see it as a drain on resources, doing this sort of 
      prep work. It only happens on first-load only. it's quick.
      NOTE scripts are parsed with DOMParser, not innerHTML, as with jquery. */

    /* INTENT: Add text as a script-canidate, that is, able to be requested
       from the TemplateCache
       given text which contains N nametag script tags, 
       turn them into script canidates. Return a list of all the new 
       scripts loaded. An optional server attributes registers a script
       for a given server, not everyone (*) */
    CompilerClass.prototype.ImportTemplatesFromText = function(scriptagstext, overwrite){
        var self = this;
        var scripts_loaded = [];

        //this is an obscure issue - when we get text from a script tag that contains
        //an ampersand, it will be misinterpretted by XML parsing, so we turn it back
        //into &amp; as required. if this breaks something else i'm so sorry.
        scriptagstext = scriptagstext.replace(/\&(?!(\#|amp\;))/g, "&amp;");

        //we GOTTA declare the namespace or firefox hates on us!
        var dom = ParseXML("<div xmlns='http://www.w3.org/1999/xhtml'>"+scriptagstext+"</div>");

        for(var i in dom.childNodes){
            var node = dom.childNodes[i];

            //only add script nodes - ignore all other elements for purposes of import.
            if(node.nodeType == 1 && 
               node.tagName == "script" && 
               (node.attributes.getNamedItem("type").nodeValue == "text/nametag")){

                //the id or name to store the script tag on, with an error if not there
                var script_id = node.attributes.getNamedItem("id").nodeValue;

                //if a server given, override the tag server, other wise use the tag server, otherwise it's the default '*'
                var server_to_use = "*";

                //use server that comes from function arguments over what comes from the script itself
                server_to_use = server_to_use ? server_to_use : "*";
                var server_and_script_name = server_to_use+"/"+script_id;

                scripts_loaded.push(server_and_script_name);

                //store the xml of the script (so we can serialize later) on the server, so we 
                //can recall it by server when we wish (or in the global "*" entry if no server given)
                Nametag.Runtime.TemplateNodesByServer[server_and_script_name] = node;

                //make a new entry on the TemplateLowercaseLookup to make sure we can find it, even when dom nodes are all one case.
                Nametag.Runtime.TemplateLowercaseLookup[server_and_script_name.toLowerCase()] = server_and_script_name;

                //console.log("server_and_script_name.toLowerCase()", server_and_script_name.toLowerCase());
                //a lookup pairing script name to tagtype
                var tagtype = node.getAttribute('tagtype');
                if(tagtype)
                    Nametag.Runtime.TemplateTagType['*/'+script_id.toLowerCase()] = tagtype;

                //setup any extends by passing our script_name and the extends attribute from it, if any
                self._PerformSetupForExtendAttribute(server_and_script_name, node.attributes.getNamedItem("extend"));

                //if the overwrite flag is set, we want to also scrub the cache of any existing script by that name so it will be reloaded.
                if(overwrite){
                    if(delete Nametag.Runtime.CompiledTemplateCache[server_and_script_name])
                        delete Nametag.Runtime.CompiledTemplateCache[server_and_script_name];
                    if(Nametag.Runtime.CompiledTemplateOptionsCache[server_and_script_name])
                        delete Nametag.Runtime.CompiledTemplateOptionsCache[server_and_script_name];
                }       
            }
        }

        //return a list of the new scripts we've loaded, as their fully qualified names (i.e. 'server:8080/somescript)
        return scripts_loaded;
    };

    //This code makes an instance out of a definition!
    //INTENT: go through all the elements evaluting tagname, as well as attributes and text,
    //for changes and replacements that make the XML stamped out correct for the *instance*
    //being made (as opposed to the definition the programmer provides via the xml scripts).
    //This only works on DOMParser XML, not HTML nodes, fwiw.
    CompilerClass.prototype._ConvertNametagsToInstances = function(script_dom){
        var allitems = $.makeArray($(script_dom).children());
        var itemsready = [];

        //find all our (recursive) children, as a list
        while(allitems.length){
            var item = allitems.pop();

            //cheap trick - nametag is not vetted for SVG yet, let's not to any name conversions to svg tags or anything inside them, for now.
            if(item.tagName.toLowerCase() != 'svg' || item.getAttribute('tagtype').toLowerCase() != 'svg'){
                itemsready.push(item);

                var children = $.makeArray($(item).children());
                for(var k = 0; k < children.length; k ++)
                    if(children[k].nodeType == 1)
                        allitems.push(children[k]);
            }   
        }

        //evaluate the items in reverse, as needed for .replaceWith(), since by changing
        //the node-context, the next write would be to the old one, if we didn't evaluate in this order. 
        itemsready.reverse();

        //for each item ready to be processed, do so if it's tag name warrants it.
        for(var i = 0, item; (item = itemsready[i]) ; i ++){
            var tagname = item.tagName.toLowerCase();

            //make a new div with the class attributes (plus class "nametag" copied over)
            //with the script parameter set the to the tagname before we replaced it with this.
            if(!Nametag.Runtime.html_tag_names[tagname]){                     

                //get server, set default if none
                var server = item.getAttribute('server');
                server = server ? server : '*';

                //get the tag type -- if any -- for this script. usually div.
                var tag = item.getAttribute('tagtype') || Nametag.Runtime.TemplateTagType[server+'/'+tagname] || "div";

                //we GOTTA declare the namespace or firefox hates on us!
                var new_div = ParseXML("<"+tag+" xmlns='http://www.w3.org/1999/xhtml'>"+PrintInnerXML(item)+"</"+tag+">");

                var script_name = Nametag.Runtime.TemplateLowercaseLookup[server+'/'+tagname];
                if(Nametag.Runtime.CompiledTemplateAttributeNames[script_name])
                    for(var key in Nametag.Runtime.CompiledTemplateAttributeNames[script_name])
                        new_div.setAttribute(key, Nametag.Runtime.CompiledTemplateAttributeNames[script_name][key]);

                //copy over attributes from old tag to new
                //IMPORTANT: looks like prop() and attr() DONT do the same thing! doesn't work with .prop()...
                for(var j = 0; j < item.attributes.length ; j ++)
                    new_div.setAttribute(item.attributes[j].nodeName, item.attributes[j].nodeValue);

                var classes = new_div.getAttribute('class');
                var new_class_value = !classes ? "nametag" : "nametag " + classes;
                new_div.setAttribute("class", new_class_value);

                //if the tag name is not "view", use the tagname as the script name.
                //the "view" tag is reserved and special - it is equiv. to <div class="nametag">
                //by itself.
                if(tagname != 'view'){
                    //if we are converting a nametag we care about server (need it to synthesize the full script name!)
                    //(of course, views are server-less). Here we get the server if any and use it for the TemplateLowercaseLookup
                    //but only place the looked up name (not fully qualified name) on script:, as server="x" will already be
                    //an attribute on the tag (if any), carrying out naturally to the output. 

                    //make sure it was found
                    if(tagname.toLowerCase() == 'parsererror'){
                        var p = script_dom;
                        while(1){
                            if(!p.parentNode)
                                break;
                            else
                                p = p.parentNode;
                        }

                        var msg = "XML PARSER PROBLEM (in tagname "+tagname+") when converting nametag to html instance: \n\n"+PrintXML(p)+"\n\n----\n\n"+PrintXML(script_dom);
                        /* Nametag.Debugger.error(msg); */
                        throw msg;
                    }

                    else if(!script_name){
                        var msg = "You're trying to instantiate a '"+tagname+"' nametag, but a script tag/id for that script has not been defined, or it is not of type 'text/nametag'! (please note the name is case insenstive)";
                        /* Nametag.Debugger.error(msg); */
                        throw msg;
                    }

                    var just_script_name = script_name.slice(script_name.indexOf('/')+1);

                    //and if it was, prepend the right script name for the html tag given, given case insenstivity.
                    $(new_div).attr("script", just_script_name);
                }

                //finally, replace the nametag/view in the document with the same item rewritten to invoke that script/no script.
                item.parentNode.replaceChild(new_div, item);  

            }
        }

        return script_dom;
    };

    //written by James Robey, jrobey.services@gmail.com
    CompilerClass.prototype._decodeURIsInNodeAttributes = function(attrs, text){
        //make a copy of the string, we don't want to alter it
        text = String(text);

        //stores the table of things to replace (key) with what to replace it with (value)
        var replaces = {};

        //always deal with N attrs to decode
        if(!(attrs instanceof Array))
            attrs = [attrs];

        for(var i = 0; i < attrs.length ; i ++){
            //the attr we are looking to decodeURI the contents of:
            var attr = attrs[i];

            //what shows up before strings we want to convert
            var attr_open = " "+attr+"=\"";

            //what closes strings we want to convert
            var attr_close = "\"";

            //the intermediate_str holds the string as we check it
    	    var intermediate_str = String(text);

    	    //the index for the start of an expanse to be considered for replacement
    	    var startidx;

    	    //for each instance of the attribute we find in the text
    	    while((startidx = intermediate_str.indexOf(attr_open)) != -1){
    	        //chop off all before it so we start at the text to replace
    	        var intermediate_str = intermediate_str.slice(startidx+attr.length+3);

    	        //find, and chop off all after, the end of the text to replace
    	        var repl_str = intermediate_str.slice(0, intermediate_str.indexOf(attr_close));

    	        //if the range to be decoded DOESN'T have a substr correlating with the replacement syntax (i.e. "{{= "), ignore it!
    	        if(repl_str.indexOf("%7B%7B=%20") == -1)
    	            continue;

    	        //store the string to replace as the key and the string to replace it with as the value
    	        //includin the attribute name to be very sure only it gets replaced (i.e. not accidentally replacing somehing not in the attr)
    	        replaces[attr_open+repl_str+attr_close] = attr_open+decodeURI(repl_str)+attr_close;
    	    }
        }

        //do the actual replacements with as few operations as possible and only where needed (the point of the exercise)
        for(var repl_str in replaces)
            text = text.replace(repl_str, replaces[repl_str], 'g')

        return text;
    };

    //INTENT: for each attribute on a script tag, add a line to a text string prepended to the script node, simulating 
    //the script as if the attributes were written there, instead. They will be processed for hitches 
    //when the template options are processed, indeed, all strings from any options are processed
    CompilerClass.prototype._parseAttributesIntoCodeBlock = function(node, script){
        //must clone and return or we edit dom we dont want to
        var node = node.cloneNode(true);

        //the string to append to the codeblock of the script tag, if any
        var output = "";

        //for each attribute we...
        for(var i = 0, attr; (attr = node.attributes[i]) ; i ++)
            if(attr.nodeName != 'id' && attr.nodeName != 'type'){
                var name = attr.nodeName;
                var value = attr.nodeValue;

                //find out, is the attribute a string, or meant to be javascript?
                //if it's javascript, merely fail to quote it, putting the str. verbatim
                //as the value of the option
                output += name+":\""+value+"\",\n";
            }

        if(output)
            $(node).prepend("\n"+output);

        return node;
    };

    /* INTENT: for every jquery script tag we find, build a lookup table of caseinsensitive to case sensitive names that
       let us know what lower case name from dom node's tagname corresponds with the cased-version the user specified in script tag ID
       defining that nametag. */
    CompilerClass.prototype._BuildTemplateLookups = function(){
        var self = this;
        $('script').each(function(){
            if(this.type == 'text/nametag'){
                var script_id = this.attributes.getNamedItem("id").nodeValue;
                var tag = this.attributes.getNamedItem("tagtype");
                tag = tag ? tag.nodeValue : "div";

                var script_name = '*/'+script_id;
                var lower_case_name = '*/'+script_id.toLowerCase();

                //store a reference to the name we got as lower case - in this way when a named script is made, 
                //we can easily find it's "real" name from it's all lowercase one. (other suggestions appreciated :)
                Nametag.Runtime.TemplateLowercaseLookup[lower_case_name] = '*/'+script_id;

                //a lookup pairing script name to tagtype
                Nametag.Runtime.TemplateTagType[lower_case_name] = tag;

                //setup any extends by passing our script_name and the extends attribute from it, if any
                self._PerformSetupForExtendAttribute(script_name, this.attributes.getNamedItem("extend"));
            }
        });
    };

    //scan all the script tags with processor = shml and process them
    CompilerClass.prototype._ProcessSHMLScriptTags = function(){
        var self = this;
        $('script').each(function(){
            if(this.type == 'text/nametag'){
                var scripttext = PrintInnerXML(this)
                    .replace(/\&lt\;/g, "<") //these two lines MUST be here for FF - FF 'encodes' script tag text when it prints them.
                    .replace(/\&gt\;/g, ">")
                    .replace(/\&quot\;/g, "\"")
                    .replace(/\&(?!\w|\#)/g, '&amp;');

                if(scripttext.indexOf("<!--") === 0){
                    var end_of_directive_idx = scripttext.indexOf("->");
                    if(end_of_directive_idx !== -1 && scripttext.slice(4, end_of_directive_idx-1).trim().toLowerCase() === "dialect shml")
                        $(this).html(new SHMLClass().process(scripttext).replace(/\&(?!\w|\#)/g, '&amp;'));
                }
            }
        });
    };

    CompilerClass.prototype.stripComments = function(file_contents){
        var lines = file_contents.split("\n");

        for(var i = 0; i < lines.length ; i ++){
            /* if the has // in it, remove from there until end of line. This then acts to 
               allow // in any nametag source - even though, in "real" xml, i would not be able to have them! win!  */
            var slashidx = lines[i].indexOf("//"); 
            if(slashidx !== -1)
                lines[i] = lines[i].slice(0, slashidx);
        }

        return lines.join("\n");
    };

    //INTENT: setup any extends lookups asked for by passing the name of the script and it
    CompilerClass.prototype._PerformSetupForExtendAttribute = function(script_name, extend){
        //if the node has an extend attribute, store it on the ExtendsTemplateLookup dict (the attr will stay there otherwise unused)
        if(extend){
            extend = extend.nodeValue.trim();

            //make it fully qualified by setting name to */name if / not given
            if(extend.indexOf("/") == -1)
                extend = "*/"+extend;

            //add this script_name to the lookup keyed on the item we are extending!
            var lookup = Nametag.Runtime.ExtendsTemplateLookup;
            if(!lookup[extend])
                lookup[extend] = [];
            lookup[extend].push(script_name);
        }
    };

    // SHML, author, James Robey, jrobey.services@gmail.com
    // all rights reserved
    // these are the symbols that define start and stop of comments for the method skipLineIfInCommentBlock

    var SHMLClass = function(indent_amt){
        var self = this;
    
        //How many spaces to a tab?this is autodetected along the way by looking at the first indent difference.
        self.indent_amt = indent_amt !== undefined ? indent_amt : 4;
    
        //constants for comparison when skipping over comments
        self.html_comment_open_symbol = "<!--";
        self.html_comment_close_symbol = "-->";
        self.js_comment_open_symbol = "/*";
        self.js_comment_close_symbol = "*/";
        self.js_comment_line_symbol = "//";
    
        return self;
    };
    
    //algorithm to process a script tag that may optionally invoke SHML processing
    //by including an initial HTML comment containing only "dialect shml" (which was
    //selected to concur with how it's done in TagOS)
    SHMLClass.prototype.processScriptText = function(scripttext){
        if(scripttext.indexOf("<!--") === 0){
            var end_of_directive_idx = scripttext.indexOf("->");
            if(end_of_directive_idx !== -1 && scripttext.slice(4, end_of_directive_idx-1).trim().toLowerCase() === "dialect shml")
                return this.process(scripttext).replace("&amp;", "&");
        }
        
        else
            return scripttext;
    };

    SHMLClass.prototype.process = function(buf, autodetect_indent_amt){
        // I will take a string [of shml] and turn it into html, such that 
        // its an XML compliant document, with all the comments removed.
        // The autodetect_indent_amt feature will use the first
        // two non-blank lines in the document with an indent difference
        // to determine what the overall indenting of the document is
        // Otherwise you can pass false and set self.indent_amt yourself
        // before running this method. 
    
        var self = this;
    
        if(autodetect_indent_amt === undefined)
            autodetect_indent_amt = true;
    
        //this processor works on whole lines, not characters.
        self.lines = buf.split("\n");

        //if they ask, find out the indent of the document for them
        if(autodetect_indent_amt)
            self.indent_amt = self.detectIndent(self.lines);

        //state for the comment detector - this will go up as comments open 
        //and down as they close for the respective type of comment,
        //such that finding one type will cause the other to be ignored 
        //until that opened tag is closed again.
        self.html_comments_open = 0;
        self.js_comments_open = 0;
    
        //each call to recursiveProcessor will process one top level element, 
        //leaving any more unprocessed. Since the recursiveProcessor will 
        //eat up blank lines, the solution is to call the recursiveProcessor
        //repeatedly, until there are no more lines to process.
        var output = [];
        while(self.lines.length !== 0){
            output.push('\n');
            output.extend(self.recursiveProcessor());
        }
        
        //return the output as accumulated, rejoined into a string, as the final result
        return output.join("\n");
    };

    // Given some text broken up by new line into an array, 
    // i'll look for the indent of the first non-blank line,
    // and then the second, returning the difference.   
    SHMLClass.prototype.detectIndent = function(lines){
        var self = this;
    
        var first_indent = false;

        for(var i = 0; i < lines.length ; i ++){
            var line = String(lines[i]);
        
            if(line.trim().length === 0) 
                continue;
            
            indent = line.length - line.ltrim().length;

            //first non-blank line
            if(first_indent === false){
                first_indent = indent;
                continue;
            }

            //if indent of current line is bigger then our first indent we're good
            else if(indent > first_indent)
                return indent - first_indent;
        }
        
        //If we are here then there was only one indent, or no indent, supply default
        return 4;
    };

    //given a number of spaces to make, return a string of empty spaces to be used to indent tags
    SHMLClass.prototype.makeIndent = function(amt){
        buf = [];
        while(buf.length < amt)
            buf.push(' ')
        return buf.join('');
    };
    
    // I will operate on lines such that myself and any lines greater 
    // indent then me will be handled by me. I will change myself 
    // into an open tag, with optional attributes (or optional text),
    // and change everything inside of me into text.. except 
    // that when i find another node i.e line starting with '>',
    // i will invoke myself on that. As I go, I (or my child) will
    // delete from the top of passed in lines variable sharing the 
    // same reference, so that as my child processes, it gets 
    // rid of input and accumulates output, and it all works 
    // out in the end to expand the SHML syntax as designed!
    SHMLClass.prototype.recursiveProcessor = function(base_indent, base_actual_indent){
        var self = this;
    
        if(base_indent === undefined)
            base_indent = 0;
    
        if(base_actual_indent === undefined)
            base_actual_indent = -1;
        
        //while loop state variables
        var output = [];
        var still_searching_for_base_indent = true;
        var tagname, attr, text;
        var current_indent = base_indent;
    
        while(1){
            //if we run out of lines (our ending condition) but are still 
            //in an open tag (i.e. not still searching for a base indent), 
            //flush out the final close tag.
            if(self.lines.length === 0){
                if(!still_searching_for_base_indent)
                    output.push(self.makeIndent(current_indent*self.indent_amt)+"</"+tagname+">");
                break;
            }
            
            //we will look at the top most line - and delete it when we've evaluated it. always pull from top!
            var line = self.lines[0];
            var strippedline = String(line.trim());
        
            //get the line without end spaces for use below
        
            //if the line is blank of if, by state stored in self.html_comments_open or js_comments_open,
            //we find the line is part of a comment block, skip it.
            if(strippedline.length === 0 || self.skipLineIfInCommentBlock(strippedline)){
                self.lines.shift();
                continue;
            }   
        
            //okay we're past the comments. Find out if the line represents a new element (or just text of an element):
            var is_new_elem = strippedline.startswith("<") && (strippedline[1] != "!") && (strippedline[1] != "%");
                        
            //get the indent of the line (that is, the unstripped one)
            current_actual_indent = line.length - line.ltrim().length;
        
            //do a little friendly error checking - this should not happen in well formed SHML
            if(is_new_elem && (strippedline.startswith("</") || strippedline.endswith('/>')))
                throw "There is no need for close tags in a SHML file! (offending lines are:)\n"+self.lines.slice(0, 10).join("\n")+"\n";
            
            //if we have not yet encountered the first tag, and this line is a new tag
            if(still_searching_for_base_indent && is_new_elem){
                //if we are processing a new tag and it's multiline, continue to accumulate attrs until a line 
                //with '>' is seen.. this lets us have multiline tags!
                if(line.indexOf(">") === -1){
                    line = line.rtrim();
                
                    //prepare the loop 
                    self.lines.shift();
                
                    //accumlate until we see an end 
                    while(self.lines[0].indexOf(">") === -1){
                        line += ' '+self.lines[0].trim();   
                        self.lines.shift();
                    }
                    
                    //accumulate the last line to get the full single line (carriage returns/spaces removed)
                    line += ' '+self.lines[0].trim();
                
                    /* update the stripped line that will be used below. tada */
                    strippedline = line.trim();
                }   
                
                //found a new tag, record the indent, set state to start looking for content or close
                base_actual_indent = current_actual_indent;
                still_searching_for_base_indent = false;
            
                try{
                    // extract the info we need from this new tag. The tagname, attrs, and text (last two optional)                
                    // this was regex in the python version but used regex features javascript dont got, so i use this
                    // ugly but works fine :)
                    var tagname = strippedline.split("<").slice(1)[0].split(">").slice(0)[0].split(" ")[0];
                    var attrs = strippedline.slice(strippedline.indexOf(tagname)+tagname.length).split(">")[0];
                    var text = strippedline.split(">").slice(1).join(">");
                }catch(err){
                    throw "It is probable your SHML has an error. it was detected when parsing this line: '"+line+"' Error is "+err;
                }
            
                //first space needed to keep things lookin' good, if no attrs
                //if(attrs)
                //    attrs = attrs;
            
                //append an opening tag to the output, for the element found
                output.push(self.makeIndent(current_indent*self.indent_amt)+'<'+tagname+attrs+">");
            
                //if text was found, add that too, with the right indent, in the output.
                if(text)
                    output.push(
                        self.makeIndent((current_indent+1)*self.indent_amt)+text
                    );
            }
                
            //if the indent of the material is such that the scope is closed, emit a close   
            else if(current_actual_indent <= base_actual_indent){
                still_searching_for_base_indent = true;
                output.push(self.makeIndent(current_indent*self.indent_amt)+"</"+tagname+">");
                current_indent -= 1;
                //if we've reached this point, we have found the end of a recursive call into the processor. return
                //without gobbling the line.. and this makes it so that text can't mess up indentation, only tags have to be right.
                return output;
            }
            
            //if we've found a new element - but we're already found our opening indent, recurse into this new element
            else if(is_new_elem){
                output.extend(self.recursiveProcessor(current_indent+1, current_actual_indent));
                continue;
            }
    
            //okay, it's just some text that goes in the tag currenlty opened, emit it.
            else
                output.push(line);
            
            //UPKEEP FOR WHILE 1 STATEMENT    
            //if that wasn't the last line, remove it from the top of the document and repeat!
            if(self.lines.length)
                self.lines.shift();
        }

        //return the output, having accumulated lines off the top of the input (lines) 
        //and appending lines to the output in response. 
        return output;
    };

    //I am a simple state machine (who's state is stored on this class, such that only
    //one thread should call any given instance at a time) that will tell you if the lines 
    //passed in succession are part of a comment block or not, working line by line and keeping track 
    //of the number of comment opens and closes. I have been written to work with nested comments 
    //properly, so except for the rule below, compliant with HTML and javascripts commenting styles
    //
    //The major limitation is that all multiline comments must be on their own lines /entirely/.
    //Comments made after - but on the same line as - javascript code will not be recognized as 
    //the start of a comment block (and will be left in); those types of comments will not count 
    //towards opens or closes of comments.
    //
    //The rule is: all multiline comments must start on their own line.
    SHMLClass.prototype.skipLineIfInCommentBlock = function(strippedline){
        var self = this;
    
        // If an open of html or js was found, look only for that type of comment until closed. Also, dont start a 
        // new block if the symbol doesn't start at the beginning of the line! Note we always check for closes the same time as opens
        // (even though we know we'll skip the line in the end) hence no returns in this section.
    
        strippedline = String(strippedline);
    
        //check the num. of html comment opens/closes (when not in a js comment block already) 
        if(!self.js_comments_open){
            if(self.html_comments_open)
                self.html_comments_open += strippedline.count(self.html_comment_open_symbol);
            
            else if(strippedline.startswith(self.html_comment_open_symbol))
                self.html_comments_open += strippedline.count(self.html_comment_open_symbol);
            
            //if we are opened, check for closes! do we balance? or will we skip more lines?
            if(self.html_comments_open){
                self.html_comments_open -= strippedline.count(self.html_comment_close_symbol);
                return true;
            }
        }
        
        //check the num. of js comment opens/closes (when not in an html comment block already)
        if(!self.html_comments_open){
            if(self.js_comments_open)
                self.js_comments_open += strippedline.count(self.js_comment_open_symbol);
            
            else if(strippedline.startswith(self.js_comment_open_symbol))
                self.js_comments_open += strippedline.count(self.js_comment_open_symbol);
            
            //if we are opened, check for closes! do we balance? or will we skip more lines?
            if(self.js_comments_open){
                self.js_comments_open -= strippedline.count(self.js_comment_close_symbol);
                return true;
            }
        }
        
        // skip a line starting with the js line comment symbol ("//") if we're in no other comment.  
        if(strippedline.startswith(self.js_comment_line_symbol))
            return true;
     
        // if we're in either a js or html comment returning true indicates we should skip the line (else it's normal!)
        return self.html_comments_open || self.js_comments_open;
    };
    
    /* ADD SOME CSS TRATIS.. COOL (what's a css trait? it's a "hook", in the ExpandNametags method, 
       for any number of methods to applied to any number of nodes, exactly once, whenever such 
       nodes are made. It's easy enough to do at document load.. but it's trickier to guarentee it 
       will be applied to every such node only once in the document whereever/whenever it's made,
       without processing the whole document, and without the creator needing to do anything special.
       because nametag elegantly controls instantiation, CSS Traits will work nicely). */
    
    Nametag.Runtime.addCSSTrait(".clickable", function(){
        //this will then be resolvable by local variable in the method made below, ensuring self is defined.
        var self = this;
        
        //give it root, parent, jnamed, etc.
        Nametag.Runtime.makeElementNavigable(self);
        
        /* if __mousedown__ is a string, make it a function */
        var mousedown = self.getAttribute("__mousedown__") || self.getAttribute("__click__");
        if(mousedown && gettype(mousedown) == 'string')
            eval("self.__mousedown__ = function(){"+mousedown+";}");
            
        /* if __mousedown__ exists, call it via the same in jquery */
        if(self.__mousedown__)
            $(self).mousedown(self.__mousedown__);
       
        //by default IS hoverselectable. should it not be?
        var hoverselectable_flag = self.getAttribute("hoverselectable"); 
        if(!hoverselectable_flag || hoverselectable_flag != "false")
            makeHoverSelectable(this); 
    });
    
    Nametag.Runtime.addCSSTrait(".button", function(){
        //this will then be resolvable by local variable in the method made below, ensuring self is defined.
        var self = this;
        
        //give it root, parent, jnamed, etc.
        Nametag.Runtime.makeElementNavigable(self);
        
        /* if __mousedown__ is a string, make it a function */
        var mousedown = self.getAttribute("__mousedown__") || self.getAttribute("__click__");
        if(mousedown && gettype(mousedown) == 'string')
            eval("self.__mousedown__ = function(){"+mousedown+";}");
            
        /* if __mousedown__ exists, call it via the same in jquery */
        if(self.__mousedown__)
            $(self).mousedown(self.__mousedown__);
       
        //by default IS hoverselectable. should it not be?
        var hoverselectable_flag = self.getAttribute("hoverselectable"); 
        if(!hoverselectable_flag || hoverselectable_flag != "false")
            makeHoverSelectable(this); 
    });
    
    //CSS trait for selects that make change events, etc. easier
    Nametag.Runtime.addCSSTrait(".select", function(){
        var self = this;
        
        //give it root, parent, jnamed, etc.
        Nametag.Runtime.makeElementNavigable(self);
        
        /* if __change__ is a string, make it a function */
        var load = self.getAttribute("__load__");
        if(load && gettype(load) == 'string')
            eval("self.__load__ = function(){"+load+";}");
        
        /* if __change__ is a string, make it a function */
        var change = self.getAttribute("__change__");
        if(change && gettype(change) == 'string')
            eval("self.__change__ = function(){"+change+";}");
            
        /* if __mousedown__ exists, call it via the same in jquery */
        if(self.__change__)
            $(self).change(self.__change__);
            
        if(self.__load__)
            fire(self, '__load__');
    });
