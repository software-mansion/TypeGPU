import { type BuildConfig, defineBuildConfig } from "unbuild";
import typegpu from "rollup-plugin-typegpu";

const Config: BuildConfig[] = defineBuildConfig({
	hooks: {
		"rollup:options": (_options, config) => {
			config.plugins.push(typegpu({ include: [/\.ts$/] }));
		},
	},
});

export default Config;
