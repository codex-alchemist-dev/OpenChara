import * as OpenRockItem from "@openrock/item-dsl/jsx-runtime";
import { Item, RawComponent } from "@openrock/item-dsl";

export default (
    <Item identifier="{{ns}}:blank_marker" formatVersion="1.21.10" menuCategory={{"category":"items"}}>
        <RawComponent type="minecraft:icon" value={{"textures":{"default":"{{ns}}_blank"}}} />
        <RawComponent type="minecraft:display_name" value={{"value":" "}} />
        <RawComponent type="minecraft:max_stack_size" value={64} />
    </Item>
);
