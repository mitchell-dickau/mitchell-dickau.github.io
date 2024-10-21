importScripts("https://cdn.jsdelivr.net/pyodide/v0.26.2/full/pyodide.js");

function sendPatch(patch, buffers, msg_id) {
  self.postMessage({
    type: 'patch',
    patch: patch,
    buffers: buffers
  })
}

async function startApplication() {
  console.log("Loading pyodide!");
  self.postMessage({type: 'status', msg: 'Loading pyodide'})
  self.pyodide = await loadPyodide();
  self.pyodide.globals.set("sendPatch", sendPatch);
  console.log("Loaded!");
  await self.pyodide.loadPackage("micropip");
  const env_spec = ['https://cdn.holoviz.org/panel/wheels/bokeh-3.6.0-py3-none-any.whl', 'https://cdn.holoviz.org/panel/1.5.2/dist/wheels/panel-1.5.2-py3-none-any.whl', 'pyodide-http==0.2.1']
  for (const pkg of env_spec) {
    let pkg_name;
    if (pkg.endsWith('.whl')) {
      pkg_name = pkg.split('/').slice(-1)[0].split('-')[0]
    } else {
      pkg_name = pkg
    }
    self.postMessage({type: 'status', msg: `Installing ${pkg_name}`})
    try {
      await self.pyodide.runPythonAsync(`
        import micropip
        await micropip.install('${pkg}');
      `);
    } catch(e) {
      console.log(e)
      self.postMessage({
	type: 'status',
	msg: `Error while installing ${pkg_name}`
      });
    }
  }
  console.log("Packages loaded!");
  self.postMessage({type: 'status', msg: 'Executing code'})
  const code = `
  \nimport asyncio\n\nfrom panel.io.pyodide import init_doc, write_doc\n\ninit_doc()\n\n\nimport panel as pn\n\n\n# raw_css = [config["css-fonts"]]\n\n\n## Set styles\npn.extension(\n    # raw_css=raw_css,\n    css_files=["assets/styles.css"],\n    js_files={"onload": "assets/onload.js"},\n    loading_spinner="arcs",\n    loading_color="#3869f6",\n    defer_load=True\n)   \npn.param.ParamMethod.loading_indicator = True\n\npn.config.throttled = True\n\n\nclass App1(pn.viewable.Viewer):\n    \n    _title = 'Mitchell Dickau'\n    \n    _page_selector = pn.widgets.RadioButtonGroup(\n                            name=("Fire weather app options"),\n                            options=['About me & contact',\n                                     'Publications',\n                                     'CV'],\n                            orientation="vertical",\n                            min_width=280,\n                            button_style="outline",\n                            button_type="light",\n                            css_classes=["button-group-menu"],\n                        )\n        \n\n    def __init__(self, **params):\n        super().__init__(**params)\n\n        self._sidebar = pn.FlexBox(  \n            align_content="flex-start",\n            align_items="center",\n            justify_content="flex-start",\n            flex_wrap="nowrap",\n            flex_direction="column",\n            sizing_mode="stretch_both",\n            css_classes=["flex-sidebar"],\n        )\n        self._main = pn.FlexBox(\n            align_content="flex-start",\n            justify_content="center",\n            flex_wrap="nowrap",\n            flex_direction="column",\n            sizing_mode="stretch_width",\n        )\n        self._header = pn.FlexBox(\n            align_content="space-evenly",\n            justify_content="space-evenly",\n            flex_wrap="nowrap",\n            flex_direction="column",\n            sizing_mode="stretch_both",\n        )\n        self._modal = pn.Column(width=850, height=500, align="center")\n        \n        self._header.append(pn.Row(pn.layout.HSpacer()))\n        self._dash = pn.template.VanillaTemplate(\n            sidebar=[self._sidebar],\n            main=[self._main],\n            modal=[self._modal],\n            header = [self._header],\n            # logo = "https://climatedata.ca/site/assets/uploads/2019/02/logo-climate-data-ca-1.png",\n            title= self._title\n        )\n        self._main.append(pn.indicators.LoadingSpinner(value=True, width=30, height=30))\n        self._sidebar.append(self._page_selector)\n\n        pn.state.onload(self._onload)\n    \n    def _onload(self):\n        try:\n            self._main.loading = True\n            self._populate_main()\n            \n        finally:\n            self._main.loading = False\n    \n    @pn.depends('_page_selector.value', watch= True)\n    def _populate_main(self):\n        if self._page_selector.value == self._page_selector.options[0]:\n            self._plot_pane = pn.pane.Markdown('''\n## Welcome to the template app1!\n\nThis is a template for panels apps on ClimateData.ca\n''')\n            self._main.objects = [self._plot_pane]\n        elif self._page_selector.value == self._page_selector.options[1]:\n            self._plot_pane = pn.pane.Markdown('''\n## Welcome to the template app2!\n\nThis is a template for panels apps on ClimateData.ca\n''')\n            self._main.objects = [self._plot_pane]        \n        elif self._page_selector.value == self._page_selector.options[2]:\n            self._plot_pane = pn.pane.Markdown('''\n## Welcome to the template app3!\n\nThis is a template for panels apps on ClimateData.ca\n''')\n            self._main.objects = [self._plot_pane]\n\n    def __panel__(self): \n        return self._dash\n \nApp1().servable()\n\nawait write_doc()
  `

  try {
    const [docs_json, render_items, root_ids] = await self.pyodide.runPythonAsync(code)
    self.postMessage({
      type: 'render',
      docs_json: docs_json,
      render_items: render_items,
      root_ids: root_ids
    })
  } catch(e) {
    const traceback = `${e}`
    const tblines = traceback.split('\n')
    self.postMessage({
      type: 'status',
      msg: tblines[tblines.length-2]
    });
    throw e
  }
}

self.onmessage = async (event) => {
  const msg = event.data
  if (msg.type === 'rendered') {
    self.pyodide.runPythonAsync(`
    from panel.io.state import state
    from panel.io.pyodide import _link_docs_worker

    _link_docs_worker(state.curdoc, sendPatch, setter='js')
    `)
  } else if (msg.type === 'patch') {
    self.pyodide.globals.set('patch', msg.patch)
    self.pyodide.runPythonAsync(`
    from panel.io.pyodide import _convert_json_patch
    state.curdoc.apply_json_patch(_convert_json_patch(patch), setter='js')
    `)
    self.postMessage({type: 'idle'})
  } else if (msg.type === 'location') {
    self.pyodide.globals.set('location', msg.location)
    self.pyodide.runPythonAsync(`
    import json
    from panel.io.state import state
    from panel.util import edit_readonly
    if state.location:
        loc_data = json.loads(location)
        with edit_readonly(state.location):
            state.location.param.update({
                k: v for k, v in loc_data.items() if k in state.location.param
            })
    `)
  }
}

startApplication()