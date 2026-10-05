import * as OpenRockItem from "@openrock/item-dsl/jsx-runtime";
import { Item, RawComponent } from "@openrock/item-dsl";

export default (
    <Item identifier="{{ns}}:soul_token" formatVersion="1.21.10" menuCategory={{"category":"items"}}>
        <RawComponent type="minecraft:icon" value={{"textures":{"default":"{{ns}}_soul_token"}}} />
        <RawComponent type="minecraft:display_name" value={{"value":"item.{{ns}}:soul_token.name"}} />
        <RawComponent type="minecraft:max_stack_size" value={1} />
        <RawComponent type="minecraft:glint" value={true} />
    </Item>
);
