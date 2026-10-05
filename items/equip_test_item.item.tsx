import * as OpenRockItem from "@openrock/item-dsl/jsx-runtime";
import { Item, RawComponent } from "@openrock/item-dsl";

export default (
    <Item identifier="{{ns}}:equip_test_item" formatVersion="1.26.30" menuCategory={{"category":"items"}}>
        <RawComponent type="minecraft:icon" value={{"textures":{"default":"{{ns}}_soul_token"}}} />
        <RawComponent type="minecraft:display_name" value={{"value":"Equip Slot Test Item"}} />
        <RawComponent type="minecraft:max_stack_size" value={64} />
    </Item>
);
